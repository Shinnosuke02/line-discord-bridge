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
const ReplyService = require('./ReplyService');

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
    // Discord準備完了
    this.discord.once('ready', async () => {
      logger.info('Discord client ready', {
        user: this.discord.user.tag,
        guilds: this.discord.guilds.cache.size
      });
      
      await this.initialize();
    });

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
      
      // ReplyServiceを初期化
      this.replyService = new ReplyService(
        this.messageMappingManager,
        this.lineService,
        this.discord
      );
      
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

    // 返信メッセージの処理
    if (message.reference?.messageId && this.replyService) {
      await this.replyService.handleDiscordReply(message, lineUserId);
    }

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

      const discordMessage = await this.createDiscordMessage(event, displayName);
      if (!discordMessage) return;

      const sentMessage = await this.sendToDiscord(mapping.discordChannelId, discordMessage, {
        useWebhook: config.webhook.enabled,
        username: displayName,
        avatarUrl
      });

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
        const urlResults = await this.mediaService.processUrls(text, lineUserId, this.lineService);
        
        if (urlResults.length === 0) {
          const result = await this.lineService.pushMessage(lineUserId, {
            type: 'text',
            text: text
          });
          if (result?.messageId) {
            lineMessageId = result.messageId;
          }
        } else if (urlResults[0]?.lineMessageId) {
          lineMessageId = urlResults[0].lineMessageId;
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
   * Discordメッセージを作成
   * @param {Object} event - LINEイベント
   * @param {string} displayName - 表示名
   * @returns {Object} Discordメッセージ
   */
  async createDiscordMessage(event, displayName) {
    const messageType = event.message.type;
    
    switch (messageType) {
      case 'text':
        return {
          content: this.lineService.formatMessage(event, displayName)
        };
        
      case 'image':
      case 'video':
      case 'audio':
      case 'file':
      case 'sticker':
        const result = await this.mediaService.processLineMedia(event.message, messageType);
        return {
          content: `**${displayName}**: ${result.content}`,
          files: result.files || []
        };
        
      case 'location':
        return {
          content: `**${displayName}** sent a location message.`
        };
        
      default:
        return {
          content: `**${displayName}** sent an unsupported message type: ${messageType}`
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
        const memberProfile = await this.lineService.getGroupMemberProfile(
          event.source.groupId,
          event.source.userId
        );
        return memberProfile.pictureUrl || null;
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
   * Discordにメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {Object} message - メッセージ
   * @param {Object} options - オプション
   * @returns {Object} 送信されたメッセージ
   */
  async sendToDiscord(channelId, message, options = {}) {
    try {
      if (options.useWebhook && options.username && this.webhookManager) {
        return await this.webhookManager.sendMessage(
          channelId,
          message,
          options.username,
          options.avatarUrl
        );
      } else {
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
      
      await this.discord.destroy();
      logger.info('MessageBridge stopped successfully');
    } catch (error) {
      logger.error('Failed to stop MessageBridge', { error: error.message });
    }
  }
}

module.exports = MessageBridge;
