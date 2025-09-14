/**
 * メッセージブリッジサービス
 * LINEとDiscord間の双方向メッセージングを管理
 */
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const LineService = require('./LineService');
const DiscordService = require('./DiscordService');
const MediaService = require('./MediaService');
const ChannelManager = require('./ChannelManager');
const WebhookManager = require('./WebhookManager');
const MessageMappingManager = require('./MessageMappingManager');
// リプライ機能は削除（複雑すぎるため）
const { processLineEmoji, processDiscordEmoji } = require('../utils/emojiHandler');

/**
 * メッセージブリッジクラス
 */
class MessageBridge {
  constructor() {
    this.discord = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    
    this.lineService = new LineService();
    this.discordService = new DiscordService();
    this.mediaService = new MediaService();
    this.messageMappingManager = new MessageMappingManager();
    this.replyService = null;
    this.channelManager = null;
    this.webhookManager = null;
    
    // DiscordServiceにクライアントを設定
    this.discordService.setClient(this.discord);
    
    this.pendingMessages = [];
    this.isInitialized = false;
    this.metrics = {
      messagesProcessed: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    this.setupEventHandlers();
  }

  /**
   * イベントハンドラーの設定
   */
  setupEventHandlers() {
    // Discord準備完了（v14互換: ready / v15: clientReady）
    this.discordReadyHandled = false;

    const onReady = async () => {
      if (this.discordReadyHandled) return;
      this.discordReadyHandled = true;
      logger.info('Discord client ready', {
        user: this.discord.user?.tag,
        guilds: this.discord.guilds.cache.size
      });
      await this.initialize();
    };

    this.discord.once('ready', onReady);
    this.discord.once('clientReady', onReady);

    // Discordメッセージ受信
    this.discord.on('messageCreate', async (message) => {
      try {
        await this.handleDiscordMessage(message);
      } catch (error) {
        logger.error('Failed to handle Discord message', {
          messageId: message.id,
          error: error.message
        });
        this.metrics.errors++;
      }
    });

    // Discordエラー
    this.discord.on('error', (error) => {
      logger.error('Discord client error', { error: error.message });
      this.metrics.errors++;
    });

    this.discord.on('warn', (warning) => {
      logger.warn('Discord client warning', { warning });
    });
  }

  /**
   * 初期化
   */
  async initialize() {
    try {
      // MessageMappingManagerを初期化
      await this.messageMappingManager.initialize();
      
      // リプライ機能は削除（複雑すぎるため）
      this.replyService = null;
      
      // ChannelManagerを初期化
      this.channelManager = new ChannelManager(this.discord, this.lineService);
      await this.channelManager.initialize();
      
      // WebhookManagerを初期化
      this.webhookManager = new WebhookManager(this.discord);
      await this.webhookManager.initialize();
      
      this.isInitialized = true;
      
      // 保留中のメッセージを処理
      await this.processPendingMessages();
      
      logger.info('MessageBridge initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MessageBridge', { error: error.message });
      throw error;
    }
  }

  /**
   * Discordメッセージを処理
   * @param {Object} message - Discordメッセージ
   */
  async handleDiscordMessage(message) {
    if (message.author.bot) return;

    if (!this.isInitialized) {
      this.pendingMessages.push({ type: 'discord', message });
      return;
    }

    const lineUserId = await this.channelManager.getLineUserId(message.channelId);
    if (!lineUserId) return;

    logger.info('Processing Discord message', {
      messageId: message.id,
      channelId: message.channelId,
      lineUserId,
      isReply: !!message.reference?.messageId
    });

    // リプライ機能は削除（複雑すぎるため）
    // 通常のメッセージ転送のみ実行

    // メッセージをLINEに転送
    await this.processDiscordToLine(message, lineUserId);
    this.metrics.messagesProcessed++;
  }

  /**
   * LINEイベントを処理
   * @param {Object} event - LINEイベント
   */
  async handleLineEvent(event) {
    if (event.type !== 'message') return;

    if (!this.isInitialized) {
      this.pendingMessages.push({ type: 'line', event });
      return;
    }

    logger.info('Processing LINE event', {
      eventId: event.message?.id,
      messageType: event.message?.type,
      sourceId: event.source.groupId || event.source.userId
    });

    await this.processLineToDiscord(event);
    this.metrics.messagesProcessed++;
  }

  /**
   * LINEメッセージをDiscordに転送
   * @param {Object} event - LINEイベント
   */
  async processLineToDiscord(event) {
    try {
      const sourceId = event.source.groupId || event.source.userId;
      const mapping = await this.channelManager.getOrCreateChannel(sourceId);
      if (!mapping) return;

      const displayName = await this.lineService.getDisplayName(event);
      const avatarUrl = await this.getLineAvatar(event);

      // チャンネル名を更新（表示名が変更された場合）
      await this.updateChannelNameIfNeeded(sourceId, displayName, event);

      // リプライ機能は削除（複雑すぎるため）
      // 通常のメッセージ転送のみ実行

      const discordMessage = await this.createDiscordMessage(event, displayName);
      if (!discordMessage) return;

      const webhookOptions = {
        useWebhook: config.webhook.enabled,
        username: this.sanitizeWebhookUsername(displayName),
        avatarUrl
      };
      
      logger.info('Sending message to Discord', {
        channelId: mapping.discordChannelId,
        webhookEnabled: config.webhook.enabled,
        username: webhookOptions.username,
        hasAvatar: !!avatarUrl,
        hasWebhookManager: !!this.webhookManager
      });
      
      const sentMessage = await this.sendToDiscord(mapping.discordChannelId, discordMessage, webhookOptions);

      // メッセージマッピングを記録
      if (sentMessage) {
        await this.messageMappingManager.mapLineToDiscord(
          event.message.id,
          sentMessage.id,
          event.source.userId,
          mapping.discordChannelId
        );
      }

      logger.info('Message forwarded from LINE to Discord', {
        lineMessageId: event.message.id,
        discordMessageId: sentMessage?.id,
        displayName
      });

    } catch (error) {
      logger.error('Failed to process LINE to Discord', {
        eventId: event.message?.id,
        error: error.message
      });
      this.metrics.errors++;
    }
  }

  /**
   * DiscordメッセージをLINEに転送
   * @param {Object} message - Discordメッセージ
   * @param {string} lineUserId - LINEユーザーID
   */
  async processDiscordToLine(message, lineUserId) {
    try {
      let lineMessageId = null;

      // 添付ファイルの処理
      if (message.attachments?.size > 0) {
        const results = await this.mediaService.processDiscordAttachments(
          Array.from(message.attachments.values()),
          lineUserId,
          this.lineService
        );
        if (results.length > 0 && results[0].lineMessageId) {
          lineMessageId = results[0].lineMessageId;
        }
      }

      // テキストメッセージの処理
      if (message.content?.trim()) {
        const text = message.content.trim();
        
        // 位置情報の検出と処理
        const locationResult = this.detectAndProcessLocation(text);
        if (locationResult) {
          const result = await this.lineService.pushMessage(lineUserId, {
            type: 'location',
            title: locationResult.title,
            address: locationResult.address,
            latitude: locationResult.latitude,
            longitude: locationResult.longitude
          });
          if (result?.messageId) {
            lineMessageId = result.messageId;
          }
        } else {
          const processedText = processDiscordEmoji(text);
          const urlResults = await this.mediaService.processUrls(processedText, lineUserId, this.lineService);
          
          if (urlResults.length === 0) {
            const result = await this.lineService.pushMessage(lineUserId, {
              type: 'text',
              text: processedText
            });
            if (result?.messageId) {
              lineMessageId = result.messageId;
            }
          } else if (urlResults[0]?.lineMessageId) {
            lineMessageId = urlResults[0].lineMessageId;
          }
        }
      }

      // スタンプの処理
      if (message.stickers?.size > 0) {
        const results = await this.mediaService.processDiscordStickers(
          Array.from(message.stickers.values()),
          lineUserId,
          this.lineService
        );
        if (results.length > 0 && results[0].lineMessageId) {
          lineMessageId = results[0].lineMessageId;
        }
      }

      // メッセージマッピングを記録
      if (lineMessageId) {
        await this.messageMappingManager.mapDiscordToLine(
          message.id,
          lineMessageId,
          lineUserId,
          message.channelId
        );
      }

    } catch (error) {
      logger.error('Failed to process Discord to LINE', {
        messageId: message.id,
        error: error.message
      });
      this.metrics.errors++;
    }
  }

  /**
   * 位置情報メッセージをフォーマット
   * @param {Object} locationMessage - LINE位置情報メッセージ
   * @returns {Object} フォーマットされたDiscordメッセージ
   */
  formatLocationMessage(locationMessage) {
    const { latitude, longitude, address } = locationMessage;
    
    // Googleマップのリンクを生成
    const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    // 住所が利用可能な場合は含める
    const addressText = address ? `\n📍 **住所**: ${address}` : '';
    
    const content = `📍 **位置情報**${addressText}
🌐 **Googleマップ**: ${googleMapsUrl}
📊 **座標**: ${latitude}, ${longitude}`;
    
    return {
      content: content
    };
  }

  /**
   * Discordメッセージから位置情報を検出・処理
   * @param {string} text - Discordメッセージテキスト
   * @returns {Object|null} 位置情報オブジェクトまたはnull
   */
  detectAndProcessLocation(text) {
    // GoogleマップのURLパターンを検出
    const googleMapsPattern = /https:\/\/www\.google\.com\/maps\?q=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/;
    const match = text.match(googleMapsPattern);
    
    if (match) {
      const latitude = parseFloat(match[1]);
      const longitude = parseFloat(match[2]);
      
      // 座標の妥当性をチェック
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return {
          title: '位置情報',
          address: null, // Discordからは住所情報が取得できない
          latitude: latitude,
          longitude: longitude
        };
      }
    }
    
    // 座標パターンを検出（例: "35.6895, 139.6917"）
    const coordinatePattern = /([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)/;
    const coordMatch = text.match(coordinatePattern);
    
    if (coordMatch) {
      const latitude = parseFloat(coordMatch[1]);
      const longitude = parseFloat(coordMatch[2]);
      
      // 座標の妥当性をチェック
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return {
          title: '位置情報',
          address: null,
          latitude: latitude,
          longitude: longitude
        };
      }
    }
    
    return null;
  }

  /**
   * Discordメッセージを作成
   * @param {Object} event - LINEイベント
   * @param {string} displayName - 表示名
   * @returns {Object} Discordメッセージ
   */
  async createDiscordMessage(event, displayName) {
    const messageType = event.message.type;
    
    switch (messageType) {
      case 'text':
        const formattedText = this.lineService.formatMessage(event, displayName);
        return {
          content: processLineEmoji(formattedText)
        };
        
      case 'image':
      case 'video':
      case 'audio':
      case 'file':
      case 'sticker':
        const result = await this.mediaService.processLineMedia(event.message, messageType, this.lineService);
        return {
          content: result.content,
          files: result.files || []
        };
        
      case 'location':
        return this.formatLocationMessage(event.message);
        
      default:
        return {
          content: `Unsupported message type: ${messageType}`
        };
    }
  }

  /**
   * LINEアバターを取得
   * @param {Object} event - LINEイベント
   * @returns {string|null} アバターURL
   */
  async getLineAvatar(event) {
    try {
      if (event.source.groupId) {
        // グループではメンバーのアイコンを優先、なければグループアイコンにフォールバック
        try {
          const memberProfile = await this.lineService.getGroupMemberProfile(
            event.source.groupId,
            event.source.userId
          );
          if (memberProfile?.pictureUrl) {
            return memberProfile.pictureUrl;
          }
        } catch (e) {
          logger.debug('Failed to get group member profile for avatar, will try group summary', {
            groupId: event.source.groupId,
            userId: event.source.userId,
            error: e.message
          });
        }

        try {
          const groupSummary = await this.lineService.getGroupSummary(event.source.groupId);
          if (groupSummary?.pictureUrl) {
            return groupSummary.pictureUrl;
          }
        } catch (e) {
          logger.debug('Failed to get group summary for avatar', {
            groupId: event.source.groupId,
            error: e.message
          });
        }
        return null;
      } else {
        const userProfile = await this.lineService.getUserProfile(event.source.userId);
        return userProfile.pictureUrl || null;
      }
    } catch (error) {
      logger.debug('Failed to get LINE avatar', { error: error.message });
      return null;
    }
  }

  /**
   * チャンネル名を必要に応じて更新（グループのみ）
   * @param {string} sourceId - ソースID
   * @param {string} displayName - 表示名
   * @param {Object} event - LINEイベント
   */
  async updateChannelNameIfNeeded(sourceId, displayName, event) {
    try {
      // グループの場合のみ更新
      if (!event.source.groupId) {
        return;
      }

      const mapping = this.channelManager.getChannelMapping(sourceId);
      if (!mapping) return;

      // グループ名を取得して新しいチャンネル名を生成
      let newChannelName;
      try {
        const groupSummary = await this.lineService.getGroupSummary(event.source.groupId);
        newChannelName = groupSummary.groupName || 'group';
      } catch (error) {
        logger.debug('Failed to get group name, using display name', { error: error.message });
        newChannelName = displayName;
      }

      // チャンネル名が変更された場合のみ更新
      if (mapping.channelName !== newChannelName) {
        const success = await this.channelManager.updateChannelName(sourceId, newChannelName);
        if (success) {
          logger.info('Channel name updated due to group name change', {
            sourceId,
            oldName: mapping.channelName,
            newName: newChannelName
          });
        }
      }
    } catch (error) {
      logger.debug('Failed to update channel name', {
        sourceId,
        displayName,
        error: error.message
      });
    }
  }

  /**
   * Webhook用のユーザー名をサニタイズ
   * @param {string} username - 元のユーザー名
   * @returns {string} サニタイズされたユーザー名
   */
  sanitizeWebhookUsername(username) {
    if (!username || username === 'Unknown User') {
      return 'LINE User';
    }
    
    // Discordの制限: "discord"を含まない、32文字以内
    return username
      .replace(/discord/gi, 'DC')
      .substring(0, 32);
  }

  /**
   * Discordにメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {Object} message - メッセージ
   * @param {Object} options - オプション
   * @returns {Object} 送信されたメッセージ
   */
  async sendToDiscord(channelId, message, options = {}) {
    try {
      if (options.useWebhook && options.username && this.webhookManager) {
        logger.debug('Using webhook to send message', {
          channelId,
          username: options.username,
          hasAvatar: !!options.avatarUrl
        });
        return await this.webhookManager.sendMessage(
          channelId,
          message,
          options.username,
          options.avatarUrl
        );
      } else {
        logger.debug('Using regular bot to send message', {
          channelId,
          useWebhook: options.useWebhook,
          hasUsername: !!options.username,
          hasWebhookManager: !!this.webhookManager
        });
        const channel = await this.discord.channels.fetch(channelId);
        return await channel.send(message);
      }
    } catch (error) {
      logger.error('Failed to send message to Discord', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 保留中のメッセージを処理
   */
  async processPendingMessages() {
    if (this.pendingMessages.length === 0) return;

    logger.info('Processing pending messages', { count: this.pendingMessages.length });

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const pendingMessage of messages) {
      try {
        if (pendingMessage.type === 'discord') {
          await this.handleDiscordMessage(pendingMessage.message);
        } else if (pendingMessage.type === 'line') {
          await this.handleLineEvent(pendingMessage.event);
        }
      } catch (error) {
        logger.error('Failed to process pending message', {
          type: pendingMessage.type,
          error: error.message
        });
        this.metrics.errors++;
      }
    }
  }

  /**
   * ファイルアップロードを処理
   * @param {Object} req - リクエスト
   * @returns {Object} 処理結果
   */
  async handleFileUpload(req) {
    try {
      // ファイルアップロード処理の実装
      if (!req.file) {
        return { success: false, message: 'No file uploaded' };
      }

      // ファイル処理ロジック
      const result = await this.mediaService.processUploadedFile(req.file);
      
      return { 
        success: true, 
        message: 'File uploaded successfully',
        result 
      };
    } catch (error) {
      logger.error('Failed to handle file upload', {
        error: error.message
      });
      return { 
        success: false, 
        message: 'File upload failed',
        error: error.message 
      };
    }
  }

  /**
   * メトリクスを取得
   * @returns {Object} メトリクス
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      isInitialized: this.isInitialized,
      pendingMessages: this.pendingMessages.length
    };
  }

  /**
   * ブリッジを開始
   */
  async start() {
    try {
      await this.discord.login(config.discord.botToken);
      logger.info('MessageBridge started successfully');
    } catch (error) {
      logger.error('Failed to start MessageBridge', { error: error.message });
      throw error;
    }
  }

  /**
   * ブリッジを停止
   */
  async stop() {
    try {
      if (this.webhookManager) {
        await this.webhookManager.stop();
      }
      
      if (this.channelManager) {
        await this.channelManager.stop();
      }
      
      // MediaServiceのクリーンアップ
      if (this.mediaService) {
        await this.mediaService.shutdown();
      }
      
      await this.discord.destroy();
      logger.info('MessageBridge stopped successfully');
    } catch (error) {
      logger.error('Failed to stop MessageBridge', { error: error.message });
    }
  }

}

module.exports = MessageBridge;
