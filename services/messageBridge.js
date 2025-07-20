/**
 * メッセージブリッジサービス
 */
const LineService = require('./lineService');
const MediaService = require('./mediaService');
const logger = require('../utils/logger');
const config = require('../config');
const fetch = require('node-fetch');

class MessageBridge {
  constructor(discordClient, channelManager) {
    this.discordClient = discordClient;
    this.channelManager = channelManager;
    this.lineService = new LineService();
    this.mediaService = new MediaService();
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
    
    logger.error('All wake up attempts failed');
    return false;
  }

  /**
   * DiscordからLINEへのメッセージ処理（ウェイクアップ対応版）
   * @param {Object} message - Discordメッセージ
   */
  async handleDiscordToLine(message) {
    // ボットメッセージまたはギルド外メッセージを無視
    if (message.author.bot || !message.guild) {
      return;
    }

    // チャンネルに対応するユーザーIDを取得
    const userId = this.channelManager.getUserIdByChannelId(message.channel.id);
    if (!userId) {
      logger.debug('No user mapping found for channel', { 
        channelId: message.channel.id,
        channelName: message.channel.name,
        availableMappings: this.channelManager.getAllMappings().length
      });
      return;
    }
    
    logger.debug('Found user mapping for channel', { 
      channelId: message.channel.id,
      userId: userId 
    });

    try {
      // サーバーのウェイクアップを確認（Render無料プラン対策）
      const isServerAwake = await this.wakeUpServer();
      
      if (!isServerAwake) {
        logger.warn('Server is not responding, message may be lost', {
          channelId: message.channel.id,
          authorId: message.author.id,
        });
        // サーバーが応答しない場合でも処理を続行（後でリトライされる可能性）
      }

      const messages = [];

      // テキストメッセージの処理
      if (message.content && message.content.trim()) {
        // URLを検出して埋め込み画像を処理
        const urlResults = await this.mediaService.processUrls(
          message.content,
          userId,
          this.lineService
        );
        
        // URL処理結果をログに記録
        const urlSuccessCount = urlResults.filter(r => r.success).length;
        const urlFailureCount = urlResults.filter(r => !r.success).length;
        
        if (urlResults.length > 0) {
          logger.info('URL processing completed', {
            userId,
            totalUrls: urlResults.length,
            successCount: urlSuccessCount,
            failureCount: urlFailureCount,
            results: urlResults
          });
        }

        // テキストメッセージを追加（URLが含まれている場合は除く）
        const textWithoutUrls = message.content.replace(/https?:\/\/[^\s]+/g, '').trim();
        if (textWithoutUrls) {
          messages.push({
            type: 'text',
            text: textWithoutUrls,
          });
        }
      }

      // 添付ファイルの処理
      if (message.attachments && message.attachments.size > 0) {
        const attachmentResults = await this.mediaService.processDiscordAttachments(
          Array.from(message.attachments.values()),
          userId,
          this.lineService
        );
        
        // 添付ファイルの処理結果をログに記録
        const successCount = attachmentResults.filter(r => r.success).length;
        const failureCount = attachmentResults.filter(r => !r.success).length;
        
        logger.info('Discord attachments processed', {
          userId,
          totalAttachments: message.attachments.size,
          successCount,
          failureCount,
          results: attachmentResults
        });
      }

      // メッセージが空の場合は何もしない
      if (messages.length === 0) {
        return;
      }

      // メッセージを送信
      if (messages.length === 1) {
        await this.lineService.pushMessage(userId, messages[0]);
      } else {
        await this.lineService.pushMessages(userId, messages);
      }

      logger.info('Message forwarded from Discord to LINE', {
        userId,
        channelId: message.channel.id,
        authorId: message.author.id,
        authorName: message.author.username,
        messageCount: messages.length,
        serverAwake: isServerAwake,
      });
    } catch (error) {
      logger.error('Failed to handle Discord to LINE message', error);
    }
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
        isBot: message.author.bot,
        hasGuild: !!message.guild
      });
      
      await this.handleDiscordToLine(message);
    });

    logger.info('Discord message listener set up');
  }
}

module.exports = MessageBridge; 