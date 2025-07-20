/**
 * メッセージブリッジサービス
 */
const LineService = require('./lineService');
const MediaService = require('./mediaService');
const DiscordService = require('./discordService');
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

      switch (messageType) {
        case 'text':
          discordMessage = this.lineService.formatMessage(event, displayName);
          await channel.send(discordMessage);
          break;

        case 'image':
          discordMessage = await this.mediaService.processLineImage(event.message);
          await channel.send(discordMessage);
          break;

        case 'video':
          discordMessage = await this.mediaService.processLineVideo(event.message);
          await channel.send(discordMessage);
          break;

        case 'audio':
          discordMessage = await this.mediaService.processLineAudio(event.message);
          await channel.send(discordMessage);
          break;

        case 'file':
          discordMessage = await this.mediaService.processLineFile(event.message);
          await channel.send(discordMessage);
          break;

        case 'location':
          const location = event.message;
          await channel.send(`**${displayName}** sent a location: ${location.title}\n${location.address}\nhttps://maps.google.com/?q=${location.latitude},${location.longitude}`);
          break;

        case 'sticker':
          discordMessage = await this.mediaService.processLineSticker(event.message);
          await channel.send(discordMessage);
          break;

        default:
          const description = this.lineService.getMessageTypeDescription(messageType);
          await channel.send(`**${displayName}** sent a ${description} message.`);
          break;
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

      // テキストメッセージの処理
      if (parsedMessage.hasText) {
        const textResult = await this.processTextMessage(parsedMessage, userId);
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

      // メッセージを送信
      if (messages.length === 1) {
        await this.lineService.pushMessage(userId, messages[0]);
      } else {
        await this.lineService.pushMessages(userId, messages);
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
   * テキストメッセージを処理
   * @param {Object} parsedMessage - 解析されたメッセージ
   * @param {string} userId - LINEユーザーID
   * @returns {Promise<Object>} 処理結果
   */
  async processTextMessage(parsedMessage, userId) {
    const messages = [];
    const results = [];

    // URLを検出して埋め込み画像を処理
    if (parsedMessage.hasUrls) {
      const urlResults = await this.mediaService.processUrls(
        parsedMessage.text,
        userId,
        this.lineService
      );
      results.push(...urlResults);
    }

    // テキストメッセージを追加（URLが含まれている場合は除く）
    const textWithoutUrls = parsedMessage.text.replace(/https?:\/\/[^\s]+/g, '').trim();
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
}

module.exports = MessageBridge; 