/**
 * メッセージブリッジサービス
 */
const LineService = require('./lineService');
const MediaService = require('./mediaService');
const DiscordService = require('./discordService');
const ReplyManager = require('./replyManager');
const DiscordReplyService = require('./discordReplyService');
const LineReplyService = require('./lineReplyService');
const MessageMapper = require('./messageMapper');
const logger = require('../utils/logger');
const config = require('../config');
const fetch = require('node-fetch');

class MessageBridge {
  constructor(discordClient, channelManager) {
    this.discordClient = discordClient;
    this.channelManager = channelManager;
    this.lineService = new LineService();
    this.mediaService = new MediaService();
    this.discordService = new DiscordService();
    
    // リプライ機能の初期化
    this.replyManager = new ReplyManager();
    this.discordReplyService = new DiscordReplyService(this.replyManager);
    this.lineReplyService = new LineReplyService(this.replyManager);

    // メッセージマッピング機能の初期化
    this.messageMapper = new MessageMapper();
    this.messageMapper.initialize().catch(error => {
      logger.error('Failed to initialize MessageMapper', error);
    });
  }

  /**
   * 初期化処理
   */
  async initialize() {
    try {
      await this.replyManager.initialize();
      logger.info('MessageBridge initialized with reply functionality');
    } catch (error) {
      logger.error('Failed to initialize MessageBridge reply functionality', error);
      // リプライ機能の初期化に失敗してもアプリは継続動作
    }
  }

  /**
   * LINEからDiscordへのメッセージ処理
   * @param {Object} event - LINEイベント
   */
  async handleLineToDiscord(event) {
    if (event.type !== 'message') {
      logger.debug('Ignoring non-message event', { eventType: event.type });
      return;
    }

    const sourceId = event.source.groupId || event.source.userId;
    const senderId = event.source.userId;

    try {
      // 表示名を取得
      const displayName = await this.lineService.getDisplayName(event);
      
      // Discordチャンネルを取得または作成
      const channelId = await this.channelManager.getOrCreateChannel(displayName, sourceId);
      const channel = await this.discordClient.channels.fetch(channelId);

      // メッセージタイプに応じて処理
      const messageType = event.message.type;
      let discordMessage;
      let sentMessage = null;

      switch (messageType) {
        case 'text':
          discordMessage = this.lineService.formatMessage(event, displayName);
          sentMessage = await channel.send(discordMessage);
          
          // メッセージマッピングを記録
          this.replyManager.addMessageMapping(
            sentMessage.id,
            event.message.id,
            channelId,
            senderId
          );
          break;

        case 'image':
          discordMessage = await this.mediaService.processLineImage(event.message);
          sentMessage = await channel.send(discordMessage);
          this.replyManager.addMessageMapping(sentMessage.id, event.message.id, channelId, senderId);
          break;

        case 'video':
          discordMessage = await this.mediaService.processLineVideo(event.message);
          sentMessage = await channel.send(discordMessage);
          this.replyManager.addMessageMapping(sentMessage.id, event.message.id, channelId, senderId);
          break;

        case 'audio':
          discordMessage = await this.mediaService.processLineAudio(event.message);
          sentMessage = await channel.send(discordMessage);
          this.replyManager.addMessageMapping(sentMessage.id, event.message.id, channelId, senderId);
          break;

        case 'file':
          discordMessage = await this.mediaService.processLineFile(event.message);
          sentMessage = await channel.send(discordMessage);
          this.replyManager.addMessageMapping(sentMessage.id, event.message.id, channelId, senderId);
          break;

        case 'location':
          const location = event.message;
          sentMessage = await channel.send(`**${displayName}** sent a location: ${location.title}\n${location.address}\nhttps://maps.google.com/?q=${location.latitude},${location.longitude}`);
          this.replyManager.addMessageMapping(sentMessage.id, event.message.id, channelId, senderId);
          break;

        case 'sticker':
          // スタンプ画像のみ送信、テキストは送信しない
          discordMessage = await this.mediaService.processLineSticker(event.message);
          sentMessage = await channel.send(discordMessage);
          this.replyManager.addMessageMapping(sentMessage.id, event.message.id, channelId, senderId);
          break;

        default:
          const description = this.lineService.getMessageTypeDescription(messageType);
          sentMessage = await channel.send(`**${displayName}** sent a ${description} message.`);
          break;
      }

      // メッセージマッピングを保存（リプライ機能のため）
      if (sentMessage && event.message?.id) {
        try {
          await this.messageMapper.addMapping(
            event.message.id,
            sentMessage.id,
            channelId,
            senderId
          );
        } catch (mappingError) {
          logger.warn('Failed to save message mapping', {
            lineMessageId: event.message.id,
            discordMessageId: sentMessage.id,
            error: mappingError.message
          });
        }
      }

      logger.info('Message forwarded from LINE to Discord', {
        sourceId,
        senderId,
        displayName,
        channelId,
        messageType,
      });
    } catch (error) {
      logger.error('Failed to handle LINE to Discord message', error);
    }
  }

  /**
   * サーバーのウェイクアップを確認（リトライ機能付き）
   * @returns {Promise<boolean>} ウェイクアップ成功かどうか
   */
  /*
  async wakeUpServer() {
    const maxRetries = 3;
    const retryDelay = 2000; // 2秒
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.server.port}`;
        const healthUrl = `${baseUrl}/health`;
        
        logger.debug(`Wake up attempt ${attempt}/${maxRetries}`, { healthUrl });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト
        
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          logger.info('Server is awake and ready', { attempt });
          return true;
        } else {
          logger.warn('Server health check failed', { 
            status: response.status, 
            attempt 
          });
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          logger.warn('Wake up request timed out', { attempt });
        } else {
          logger.error('Failed to wake up server', { 
            attempt, 
            error: error.message 
          });
        }
      }
      
      // 最後の試行でない場合は待機
      if (attempt < maxRetries) {
        logger.debug(`Waiting ${retryDelay}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    return false;
  }
  */

  /**
   * DiscordからLINEへのメッセージ処理（リファクタリング版）
   * @param {Object} message - Discordメッセージ
   */
  async handleDiscordToLine(message) {
    // DiscordServiceを使用してメッセージを解析
    if (!this.discordService.isValidMessage(message)) {
      logger.debug('Invalid Discord message, skipping', {
        channelId: message.channel.id,
        authorId: message.author.id,
        isBot: message.author.bot,
        hasGuild: !!message.guild
      });
      return;
    }

    const parsedMessage = this.discordService.parseMessage(message);
    const summary = this.discordService.generateSummary(parsedMessage);
    
    logger.info('Processing Discord message', {
      channelId: parsedMessage.channelId,
      authorName: parsedMessage.authorName,
      summary
    });

    // チャンネルに対応するユーザーIDを取得
    const userId = this.channelManager.getUserIdByChannelId(parsedMessage.channelId);
    if (!userId) {
      logger.debug('No user mapping found for channel', { 
        channelId: parsedMessage.channelId,
        availableMappings: this.channelManager.getAllMappings().length
      });
      return;
    }
    
    logger.debug('Found user mapping for channel', { 
      channelId: parsedMessage.channelId,
      userId: userId 
    });

    try {
      // リプライ機能の処理
      let replyResult = null;
      if (this.discordReplyService.isAvailable()) {
        try {
          replyResult = await this.discordReplyService.processReplyMessage(message);
        } catch (error) {
          logger.error('Failed to process reply message', error);
          // リプライ処理に失敗しても通常のメッセージとして処理
        }
      }

      // サーバーのウェイクアップを確認
      /*
      const isServerAwake = await this.wakeUpServer();
      
      if (!isServerAwake) {
        logger.warn('Server is not responding, message may be lost', {
          channelId: parsedMessage.channelId,
          authorId: parsedMessage.authorId,
        });
      }
      */

      const messages = [];
      const results = [];

      // テキストメッセージの処理（リプライ対応）
      if (parsedMessage.hasText) {
        const textResult = await this.processTextMessage(parsedMessage, userId, replyResult);
        messages.push(...textResult.messages);
        results.push(...textResult.results);
      }

      // 添付ファイルの処理
      if (parsedMessage.hasAttachments) {
        const attachmentResult = await this.processAttachments(parsedMessage.attachments, userId);
        results.push(...attachmentResult);
      }

      // スタンプの処理
      if (parsedMessage.hasStickers) {
        const stickerResult = await this.processStickers(parsedMessage.stickers, userId);
        results.push(...stickerResult);
      }

      // メッセージが空の場合は何もしない
      if (messages.length === 0) {
        logger.debug('No messages to send', { userId });
        return;
      }

      // リプライメッセージかどうかを判定
      const discordMessageInfo = this.discordService.extractMessageInfo(message);
      const isReplyMessage = discordMessageInfo.isReply;
      
      // メッセージを送信（リプライかどうかで分岐）
      let sendResult = null;
      if (isReplyMessage && message.reference?.messageId) {
        // リプライメッセージの処理
        sendResult = await this.handleDiscordReplyToLine(
          message,
          messages,
          userId,
          parsedMessage
        );
      } else {
        // 通常メッセージの処理
        if (messages.length === 1) {
          sendResult = await this.lineService.pushMessage(userId, messages[0]);
        } else {
          sendResult = await this.lineService.pushMessages(userId, messages);
        }
      }

      // メッセージマッピングを保存（送信成功時のみ）
      if (sendResult && message.id) {
        try {
          // LINEからの応答にメッセージIDが含まれている場合のマッピング
          // 注意: pushMessageの場合、LINEからメッセージIDが返されない場合が多い
          // そのため、DiscordメッセージIDのみを記録し、後でLINEのWebhookで関連付ける
          const channelId = parsedMessage.channelId;
          await this.messageMapper.addMapping(
            null, // LINEメッセージIDは後でWebhookで設定
            message.id,
            channelId,
            userId
          );
        } catch (mappingError) {
          logger.warn('Failed to save Discord to LINE message mapping', {
            discordMessageId: message.id,
            userId,
            error: mappingError.message
          });
        }
      }

      // 結果をログ
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      logger.info('Discord to LINE processing completed', {
        userId,
        channelId: parsedMessage.channelId,
        authorName: parsedMessage.authorName,
        messageCount: messages.length,
        successCount,
        failureCount,
        serverAwake: isServerAwake,
        results
      });
    } catch (error) {
      logger.error('Failed to handle Discord to LINE message', {
        channelId: parsedMessage.channelId,
        userId,
        error: error.message
      });
    }
  }

  /**
   * テキストメッセージを処理（リプライ対応）
   * @param {Object} parsedMessage - 解析されたメッセージ
   * @param {string} userId - LINEユーザーID
   * @param {Object} replyResult - リプライ処理結果
   * @returns {Promise<Object>} 処理結果
   */
  async processTextMessage(parsedMessage, userId, replyResult = null) {
    const messages = [];
    const results = [];

    // リプライ機能の処理
    let textToProcess = parsedMessage.text;
    if (replyResult && replyResult.isReply) {
      // リプライの場合は特別な処理
      try {
        const lineReplyMessage = this.lineReplyService.generateDiscordReplyMessage(
          { content: parsedMessage.text },
          replyResult.originalMessage?.id || 'unknown'
        );
        textToProcess = lineReplyMessage.text;
        
        logger.info('Discord reply processed for LINE', {
          originalMessageId: replyResult.originalMessage?.id,
          replyText: textToProcess.substring(0, 100)
        });
      } catch (error) {
        logger.error('Failed to process Discord reply for LINE', error);
        // エラー時は通常のテキストとして処理
      }
    }

    // URLを検出して埋め込み画像を処理
    if (parsedMessage.hasUrls) {
      const urlResults = await this.mediaService.processUrls(
        textToProcess,
        userId,
        this.lineService
      );
      results.push(...urlResults);
    }

    // テキストメッセージを追加（URLが含まれている場合は除く）
    const textWithoutUrls = textToProcess.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (textWithoutUrls) {
      messages.push({
        type: 'text',
        text: textWithoutUrls,
      });
    }

    return { messages, results };
  }

  /**
   * 添付ファイルを処理
   * @param {Array} attachments - 添付ファイル配列
   * @param {string} userId - LINEユーザーID
   * @returns {Promise<Array>} 処理結果
   */
  async processAttachments(attachments, userId) {
    return await this.mediaService.processDiscordAttachments(
      attachments,
      userId,
      this.lineService
    );
  }

  /**
   * スタンプを処理
   * @param {Array} stickers - スタンプ配列
   * @param {string} userId - LINEユーザーID
   * @returns {Promise<Array>} 処理結果
   */
  async processStickers(stickers, userId) {
    const results = [];

    for (const sticker of stickers) {
      try {
        // スタンプ画像をダウンロード
        const content = await this.mediaService.downloadFile(sticker.url, `sticker_${sticker.id}.png`);
        
        // LINEにスタンプとして送信
        await this.lineService.sendImage(userId, content, `sticker_${sticker.id}.png`);
        
        results.push({
          success: true,
          type: 'sticker',
          stickerId: sticker.id,
          stickerName: sticker.name
        });

        logger.info('Discord sticker sent to LINE', {
          userId,
          stickerId: sticker.id,
          stickerName: sticker.name
        });
      } catch (error) {
        logger.error('Failed to send Discord sticker to LINE', {
          userId,
          stickerId: sticker.id,
          error: error.message
        });
        
        // エラーメッセージを送信
        await this.lineService.pushMessage(userId, {
          type: 'text',
          text: `**スタンプ**: ${sticker.name} (送信に失敗しました)`,
        });

        results.push({
          success: false,
          type: 'sticker',
          stickerId: sticker.id,
          stickerName: sticker.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Discordメッセージイベントリスナーを設定
   */
  setupDiscordMessageListener() {
    this.discordClient.on('messageCreate', async (message) => {
      logger.debug('Discord message received', {
        channelId: message.channel.id,
        authorId: message.author.id,
        authorName: message.author.username,
        content: message.content?.substring(0, 100),
        attachments: message.attachments?.size || 0,
        stickers: message.stickers?.size || 0,
        isBot: message.author.bot,
        hasGuild: !!message.guild
      });
      
      await this.handleDiscordToLine(message);
    });

    logger.info('Discord message listener set up');
  }

  /**
   * Discordのリプライメッセージを LINEに送信
   * @param {Object} discordMessage - Discordメッセージ
   * @param {Array} messages - 送信するメッセージ配列
   * @param {string} userId - LINEユーザーID
   * @param {Object} parsedMessage - 解析されたメッセージ
   * @returns {Promise<Object>} 送信結果
   */
  async handleDiscordReplyToLine(discordMessage, messages, userId, parsedMessage) {
    try {
      const referencedMessageId = discordMessage.reference.messageId;
      
      // 参照先メッセージに対応するLINEメッセージを探す
      const lineMapping = this.messageMapper.getLineMessage(referencedMessageId);
      
      if (lineMapping && lineMapping.lineMessageId) {
        logger.info('Found LINE message for Discord reply', {
          discordReferencedId: referencedMessageId,
          lineMessageId: lineMapping.lineMessageId,
          userId
        });

        // リプライコンテキストを含むメッセージを作成
        const replyPrefix = `> 返信`;
        const modifiedMessages = messages.map(msg => {
          if (msg.type === 'text') {
            return {
              ...msg,
              text: `${replyPrefix}\n${msg.text}`
            };
          }
          return msg;
        });

        // LINE にメッセージを送信
        if (modifiedMessages.length === 1) {
          return await this.lineService.pushMessage(userId, modifiedMessages[0]);
        } else {
          return await this.lineService.pushMessages(userId, modifiedMessages);
        }
      } else {
        logger.debug('No LINE message mapping found for Discord reply, sending as regular message', {
          discordReferencedId: referencedMessageId,
          userId
        });

        // マッピングが見つからない場合は通常のメッセージとして送信
        if (messages.length === 1) {
          return await this.lineService.pushMessage(userId, messages[0]);
        } else {
          return await this.lineService.pushMessages(userId, messages);
        }
      }
    } catch (error) {
      logger.error('Failed to handle Discord reply to LINE', {
        discordMessageId: discordMessage.id,
        referencedMessageId: discordMessage.reference?.messageId,
        userId,
        error: error.message
      });

      // エラー時は通常のメッセージとして送信を試行
      try {
        if (messages.length === 1) {
          return await this.lineService.pushMessage(userId, messages[0]);
        } else {
          return await this.lineService.pushMessages(userId, messages);
        }
      } catch (fallbackError) {
        logger.error('Fallback message sending failed', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * LINEのリプライメッセージをDiscordに送信
   * @param {Object} event - LINEイベント
   * @param {string} displayName - 表示名
   * @param {string} channelId - DiscordチャンネルID
   * @returns {Promise<Object>} 送信結果
   */
  async handleLineReplyToDiscord(event, displayName, channelId) {
    try {
      // LINEでは明示的なリプライ機能がWebhook APIには含まれていないため、
      // メッセージ内容からリプライを検出する必要がある
      // ここでは、まず通常のメッセージ処理を行い、将来的にリプライ検出ロジックを追加

      const channel = await this.discordClient.channels.fetch(channelId);
      const messageType = event.message.type;
      let sentMessage = null;

      // メッセージタイプに応じて処理
      switch (messageType) {
        case 'text':
          const discordMessage = this.lineService.formatMessage(event, displayName);
          sentMessage = await channel.send(discordMessage);
          break;

        case 'image':
          const imageMessage = await this.mediaService.processLineImage(event.message);
          sentMessage = await channel.send(imageMessage);
          break;

        case 'video':
          const videoMessage = await this.mediaService.processLineVideo(event.message);
          sentMessage = await channel.send(videoMessage);
          break;

        case 'audio':
          const audioMessage = await this.mediaService.processLineAudio(event.message);
          sentMessage = await channel.send(audioMessage);
          break;

        case 'file':
          const fileMessage = await this.mediaService.processLineFile(event.message);
          sentMessage = await channel.send(fileMessage);
          break;

        case 'location':
          const location = event.message;
          sentMessage = await channel.send(`**${displayName}** sent a location: ${location.title}\n${location.address}\nhttps://maps.google.com/?q=${location.latitude},${location.longitude}`);
          break;

        case 'sticker':
          const stickerMessage = await this.mediaService.processLineSticker(event.message);
          sentMessage = await channel.send(stickerMessage);
          break;

        default:
          const description = this.lineService.getMessageTypeDescription(messageType);
          sentMessage = await channel.send(`**${displayName}** sent a ${description} message.`);
          break;
      }

      return sentMessage;
    } catch (error) {
      logger.error('Failed to handle LINE reply to Discord', {
        lineMessageId: event.message?.id,
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージマッパーの統計情報を取得
   * @returns {Object} 統計情報
   */
  getMessageMappingStats() {
    return this.messageMapper.getStats();
  }

  /**
   * 特定のチャンネルのメッセージマッピングを取得
   * @param {string} channelId - チャンネルID
   * @returns {Array} マッピング配列
   */
  getChannelMessageMappings(channelId) {
    return this.messageMapper.getMappingsByChannel(channelId);
  }

  /**
   * 特定のユーザーのメッセージマッピングを取得
   * @param {string} userId - ユーザーID
   * @returns {Array} マッピング配列
   */
  getUserMessageMappings(userId) {
    return this.messageMapper.getMappingsByUser(userId);
  }
}

module.exports = MessageBridge; 