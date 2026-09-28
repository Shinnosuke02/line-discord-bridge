/**
 * メッセージブリッジサービス
 * LINEとDiscord間の双方向メッセージングを管理
 */
const { Client, GatewayIntentBits, Events } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const LineService = require('./LineService');
const DiscordService = require('./DiscordService');
const MediaService = require('./MediaService');
const ChannelManager = require('./PersistentChannelManager');
const WebhookManager = require('./WebhookManager');
const MessageMappingManager = require('./MessageMappingManager');
const LineSendSession = require('./LineSendSession');
const BridgeFeatureManager = require('../features/BridgeFeatureManager');
const { processLineEmoji, processDiscordEmoji } = require('../utils/emojiHandler');
const lineLimitHandler = require('../middleware/lineLimitHandler');
const LineUsageMonitor = require('./LineUsageMonitor');
const { getLineSourceId } = require('../utils/lineSource');

/**
 * メッセージブリッジクラス
 */
class MessageBridge {
  constructor() {
    this.discord = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    
    this.lineService = new LineService();
    this.discordService = new DiscordService();
    this.mediaService = new MediaService();
    this.messageMappingManager = new MessageMappingManager();
    this.featureManager = new BridgeFeatureManager({
      messageMappingManager: this.messageMappingManager
    });
    this.channelManager = null;
    this.webhookManager = null;
    this.lineUsageMonitor = new LineUsageMonitor();
    
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
    const onReady = async () => {
      logger.info('Discord client ready', {
        user: this.discord.user?.tag,
        guilds: this.discord.guilds.cache.size
      });
      await this.initialize();
    };

    this.discord.once(Events.ClientReady, onReady);

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
      await lineLimitHandler.initialize();
      
      await this.featureManager.initialize();
      
      // ChannelManagerを初期化
      this.channelManager = new ChannelManager(this.discord, this.lineService);
      await this.channelManager.initialize();
      
      // WebhookManagerを初期化
      this.webhookManager = new WebhookManager(this.discord);
      await this.webhookManager.initialize();
      
      this.isInitialized = true;
      
      // 保留中のメッセージを処理
      await this.processPendingMessages();
      
      // LINE使用量監視を開始
      this.startLineUsageMonitoring();
      
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

    // メッセージをLINEに転送
    await this.processDiscordToLine(message, lineUserId);
    this.metrics.messagesProcessed++;
  }

  /**
   * LINEイベントを処理
   * @param {Object} event - LINEイベント
   */
  async handleLineEvent(event) {
    if (!this.isInitialized) {
      this.pendingMessages.push({ type: 'line', event });
      return true;
    }

    logger.info('Processing LINE event', {
      type: event.type,
      eventId: event.message?.id || event.unsend?.messageId || null,
      messageType: event.message?.type || null,
      sourceId: getLineSourceId(event.source)
    });

    let processed = true;
    if (event.type === 'message') {
      processed = await this.processLineToDiscord(event);
    } else if (event.type === 'messageEdited') {
      processed = await this.processLineEditToDiscord(event);
    } else if (event.type === 'unsend') {
      processed = await this.processLineUnsendToDiscord(event);
    }

    if (processed !== false) {
      this.metrics.messagesProcessed++;
    }
    return processed;
  }

  /**
   * LINEメッセージをDiscordに転送
   * @param {Object} event - LINEイベント
   */
  async processLineToDiscord(event) {
    try {
      // 重複チェック: 既に処理済みのメッセージIDの場合はスキップ
      const lineMessageId = event.message?.id;
      if (lineMessageId) {
        const existingMapping = this.messageMappingManager.getLineToDiscordMapping(lineMessageId);
        if (existingMapping) {
          logger.debug('Skipping duplicate LINE message', {
            lineMessageId,
            discordMessageId: existingMapping.discordMessageId,
            timestamp: existingMapping.timestamp
          });
          return;
        }
      }

      const sourceId = getLineSourceId(event.source);
      const mapping = await this.channelManager.getOrCreateChannel(sourceId);
      if (!mapping) return;

      const displayName = await this.lineService.getDisplayName(event);
      const avatarUrl = await this.getLineAvatar(event);

      // チャンネル名を更新（表示名が変更された場合）
      await this.updateChannelNameIfNeeded(sourceId, displayName, event);

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
      
      let replyTargetDiscordMessageId = null;
      try {
        const featureOptions = await this.featureManager.resolveDiscordSendOptions(event);
        replyTargetDiscordMessageId = featureOptions.replyToMessageId || null;
        if (replyTargetDiscordMessageId) {
          webhookOptions.replyToMessageId = replyTargetDiscordMessageId;
          logger.debug('Reply target found, will send as reply', {
            replyTargetDiscordMessageId,
            lineMessageId: event.message.id
          });
        }
      } catch (replyError) {
        // 返信元の取得に失敗しても、通常のメッセージ転送は継続
        logger.debug('Failed to get reply target, will send as normal message', {
          error: replyError.message,
          lineMessageId: event.message.id
        });
      }

      const sentMessage = await this.sendToDiscord(mapping.discordChannelId, discordMessage, webhookOptions);

      // メッセージマッピングを記録（replyTokenも保存）
      if (sentMessage) {
        const replyToken = event.replyToken || null;
        const quoteToken = event.message?.quoteToken || null;
        await this.messageMappingManager.mapLineToDiscord(
          event.message.id,
          sentMessage.id,
          event.source.userId,
          mapping.discordChannelId,
          {
            replyToken,
            quoteToken,
            messageType: event.message?.type || null,
            transport: webhookOptions.useWebhook
              && !(webhookOptions.replyToMessageId && config.features.lineToDiscordReplyMode === 'bot-reply')
              ? 'webhook'
              : 'bot',
            webhookId: sentMessage.webhookId || null
          }
        );
      }

      logger.info('Message forwarded from LINE to Discord', {
        lineMessageId: event.message.id,
        discordMessageId: sentMessage?.id,
        displayName,
        isReply: !!replyTargetDiscordMessageId
      });

      if (config.features.markLineReadOnDiscordDelivery && event.message?.markAsReadToken) {
        await this.lineService.markMessagesAsRead(event.message.markAsReadToken);
      }

      return Boolean(sentMessage);
    } catch (error) {
      logger.error('Failed to process LINE to Discord', {
        eventId: event.message?.id,
        error: error.message
      });
      this.metrics.errors++;
      throw error;
    }
  }

  async processLineEditToDiscord(event) {
    const lineMessageId = event.message?.id;
    if (!lineMessageId) {
      return true;
    }

    const mapping = this.messageMappingManager.getLineToDiscordMapping(lineMessageId);
    if (!mapping?.discordMessageId || !mapping?.discordChannelId) {
      throw new Error(`Original LINE message mapping not found for edit: ${lineMessageId}`);
    }

    if (event.message.type !== 'text') {
      logger.info('Ignoring non-text LINE message edit', {
        lineMessageId,
        messageType: event.message.type
      });
      return true;
    }

    const content = processLineEmoji(this.lineService.formatMessage(event, ''));
    if (mapping.transport === 'webhook' && this.webhookManager) {
      await this.webhookManager.editMessage(mapping.discordChannelId, mapping.discordMessageId, {
        content
      });
    } else {
      const channel = await this.discord.channels.fetch(mapping.discordChannelId);
      const message = await channel.messages.fetch(mapping.discordMessageId);
      await message.edit({
        content,
        allowedMentions: { parse: [] }
      });
    }

    await this.messageMappingManager.mapLineToDiscord(
      lineMessageId,
      mapping.discordMessageId,
      mapping.lineUserId || event.source?.userId || null,
      mapping.discordChannelId,
      {
        replyToken: event.replyToken || mapping.replyToken || null,
        quoteToken: event.message?.quoteToken || mapping.quoteToken || null,
        messageType: event.message.type,
        transport: mapping.transport,
        webhookId: mapping.webhookId
      }
    );

    return true;
  }

  async processLineUnsendToDiscord(event) {
    const lineMessageId = event.unsend?.messageId;
    if (!lineMessageId) {
      return true;
    }

    const mapping = this.messageMappingManager.getLineToDiscordMapping(lineMessageId);
    if (!mapping?.discordMessageId || !mapping?.discordChannelId) {
      logger.debug('No Discord mapping found for LINE unsend', { lineMessageId });
      return true;
    }

    if (mapping.transport === 'webhook' && this.webhookManager) {
      await this.webhookManager.deleteMessage(mapping.discordChannelId, mapping.discordMessageId);
    } else {
      const channel = await this.discord.channels.fetch(mapping.discordChannelId);
      const message = await channel.messages.fetch(mapping.discordMessageId);
      await message.delete();
    }

    await this.messageMappingManager.removeMapping(lineMessageId, null);
    return true;
  }

  /**
   * DiscordメッセージをLINEに転送
   * @param {Object} message - Discordメッセージ
   * @param {string} lineUserId - LINEユーザーID
   */
  async processDiscordToLine(message, lineUserId) {
    try {
      const lineSendContext = await this.featureManager.resolveLineSendContext(message);
      const lineSendSession = new LineSendSession(lineSendContext);
      const trackedLineService = this.createTrackedLineService(lineUserId, lineSendSession);

      if (message.attachments?.size > 0) {
        await this.mediaService.processDiscordAttachments(
          Array.from(message.attachments.values()),
          lineUserId,
          trackedLineService
        );
      }

      if (message.content?.trim()) {
        const text = message.content.trim();
        const locationResult = this.detectAndProcessLocation(text);

        if (locationResult) {
          await this.sendTrackedLineMessage(lineUserId, {
            type: 'location',
            title: locationResult.title,
            address: locationResult.address,
            latitude: locationResult.latitude,
            longitude: locationResult.longitude
          }, lineSendSession);
        } else {
          const processedText = processDiscordEmoji(text);
          const googleMapsResult = this.detectGoogleMapsLink(processedText);

          if (googleMapsResult) {
            const remainingText = processedText.replace(googleMapsResult.url, '').trim();
            if (remainingText) {
              await this.sendTrackedLineMessage(lineUserId, {
                type: 'text',
                text: remainingText
              }, lineSendSession);
            }

            await this.sendTrackedLineMessage(lineUserId, {
              type: 'location',
              title: googleMapsResult.title,
              address: googleMapsResult.address,
              latitude: googleMapsResult.latitude,
              longitude: googleMapsResult.longitude
            }, lineSendSession);
          } else {
            await this.sendTrackedLineMessage(lineUserId, {
              type: 'text',
              text: processedText
            }, lineSendSession);
          }
        }
      }

      if (message.stickers?.size > 0) {
        await this.mediaService.processDiscordStickers(
          Array.from(message.stickers.values()),
          lineUserId,
          trackedLineService
        );
      }

      const sentMessages = lineSendSession.getSentMessages();
      if (sentMessages.length > 0) {
        await this.messageMappingManager.mapDiscordToLines(
          message.id,
          sentMessages,
          lineUserId,
          message.channelId
        );
      }

      return sentMessages;
    } catch (error) {
      logger.error('Failed to process Discord to LINE', {
        messageId: message.id,
        error: error.message
      });
      this.metrics.errors++;
      throw error;
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
   * GoogleMapsリンクを検出
   * @param {string} text - Discordメッセージテキスト
   * @returns {Object|null} GoogleMapsリンク情報またはnull
   */
  detectGoogleMapsLink(text) {
    // GoogleマップのURLパターンを検出
    const googleMapsPattern = /https:\/\/www\.google\.com\/maps\?q=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/;
    const match = text.match(googleMapsPattern);
    
    if (match) {
      const latitude = parseFloat(match[1]);
      const longitude = parseFloat(match[2]);
      
      // 座標の妥当性をチェック
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return {
          url: match[0],
          title: '位置情報',
          address: null, // Discordからは住所情報が取得できない
          latitude: latitude,
          longitude: longitude
        };
      }
    }
    
    return null;
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
    case 'text': {
      const formattedText = this.lineService.formatMessage(event, displayName);
      return {
        content: processLineEmoji(formattedText)
      };
    }
        
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
    case 'sticker': {
      const result = await this.mediaService.processLineMedia(event.message, messageType, this.lineService);
      return {
        content: result.content,
        files: result.files || []
      };
    }
        
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
      if (options.replyToMessageId && config.features.lineToDiscordReplyMode === 'bot-reply') {
        logger.debug('Using bot reply mode for LINE reply on Discord', {
          channelId,
          replyToMessageId: options.replyToMessageId
        });
        return await this.sendLineReplyAsBot(channelId, message, options);
      }

      if (options.useWebhook && options.username && this.webhookManager) {
        logger.debug('Using webhook to send message', {
          channelId,
          username: options.username,
          hasAvatar: !!options.avatarUrl,
          isReply: !!options.replyToMessageId
        });
        return await this.webhookManager.sendMessage(
          channelId,
          message,
          options.username,
          options.avatarUrl,
          options.replyToMessageId || null
        );
      }

      logger.debug('Using regular bot to send message', {
        channelId,
        useWebhook: options.useWebhook,
        hasUsername: !!options.username,
        hasWebhookManager: !!this.webhookManager,
        isReply: !!options.replyToMessageId
      });
      const channel = await this.discord.channels.fetch(channelId);
      if (options.replyToMessageId) {
        return await channel.send({
          ...message,
          allowedMentions: { parse: [] },
          reply: {
            messageReference: options.replyToMessageId,
            failIfNotExists: false
          }
        });
      }

      return await channel.send({
        ...message,
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      logger.error('Failed to send message to Discord', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  async sendLineReplyAsBot(channelId, message, options) {
    const { replyToMessageId, username, avatarUrl } = options;
    const channel = await this.discord.channels.fetch(channelId);
    const originalMessage = await channel.messages.fetch(replyToMessageId);
    const replyPayload = this.buildBotReplyPayload(
      message,
      originalMessage,
      replyToMessageId,
      username,
      avatarUrl
    );
    return await channel.send(replyPayload);
  }

  buildBotReplyPayload(message, originalMessage, replyToMessageId, replierName, replierAvatar) {
    const embeds = [];
    const replyText = message.content || '';

    embeds.push({
      author: {
        name: replierName || 'LINE User',
        ...(replierAvatar ? { icon_url: replierAvatar } : {})
      },
      ...(replyText ? { description: replyText } : {}),
      color: 0x5865F2
    });

    if (Array.isArray(message.embeds) && message.embeds.length > 0) {
      embeds.push(...message.embeds);
    }

    return {
      ...message,
      content: '',
      embeds,
      allowedMentions: { parse: [] },
      reply: {
        messageReference: replyToMessageId,
        failIfNotExists: false
      }
    };
  }

  getDiscordReplyTargetName(originalMessage) {
    return originalMessage?.member?.displayName
      || originalMessage?.author?.globalName
      || originalMessage?.author?.displayName
      || originalMessage?.author?.username
      || 'Unknown User';
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

  async sendTrackedLineMessage(userId, message, lineSendContext = new LineSendSession()) {
    const lineSendSession = this.toLineSendSession(lineSendContext);
    const replyResult = await this.sendLineReplyMessageIfAvailable(userId, message, lineSendSession);
    if (replyResult) {
      lineSendSession.recordResult(replyResult, message.type, 'reply');
      return replyResult;
    }

    const outboundMessage = this.featureManager.applyLineSendContext(
      message,
      lineSendSession.getPushContext()
    );
    const limitCheck = lineLimitHandler.shouldLimitMessage(outboundMessage);
    if (!limitCheck.allowed) {
      logger.warn('LINE message blocked due to monthly limit', {
        userId,
        messageType: outboundMessage.type,
        reason: limitCheck.reason
      });
      return null;
    }

    const result = await this.lineService.pushMessage(userId, outboundMessage);
    if (result?.messageId) {
      lineLimitHandler.recordMessageSent();
      lineSendSession.recordResult(result, outboundMessage.type, 'push');
    }

    return result;
  }

  async sendLineReplyMessageIfAvailable(userId, message, lineSendContext = new LineSendSession()) {
    const lineSendSession = this.toLineSendSession(lineSendContext);
    const replyTokenClaim = lineSendSession.claimReplyToken();
    if (!replyTokenClaim) {
      return null;
    }

    const { replyToken, replyTokenLineMessageId } = replyTokenClaim;

    const markedUsed = await this.messageMappingManager.markReplyTokenUsed(replyTokenLineMessageId);
    if (!markedUsed) {
      logger.debug('Reply token is no longer available, falling back to push message', {
        userId,
        replyTokenLineMessageId
      });
      return null;
    }

    try {
      const result = await this.lineService.replyMessage(replyToken, message);
      logger.info('LINE reply message sent using replyToken', {
        userId,
        replyTokenLineMessageId,
        messageType: message.type,
        messageId: result?.messageId
      });
      return result;
    } catch (error) {
      logger.warn('Failed to send LINE reply message, falling back to push message', {
        userId,
        replyTokenLineMessageId,
        messageType: message.type,
        error: error.message
      });
      return null;
    }
  }

  createTrackedLineService(lineUserId, lineSendContext = new LineSendSession()) {
    const lineSendSession = this.toLineSendSession(lineSendContext);
    return {
      ...this.lineService,
      pushMessage: async (targetUserId, message) => {
        if (targetUserId !== lineUserId) {
          return this.lineService.pushMessage(targetUserId, message);
        }

        return this.sendTrackedLineMessage(targetUserId, message, lineSendSession);
      }
    };
  }

  toLineSendSession(lineSendContext = {}) {
    if (lineSendContext instanceof LineSendSession) {
      return lineSendContext;
    }

    return new LineSendSession(lineSendContext);
  }

  /**
   * LINE使用量監視を開始
   */
  startLineUsageMonitoring() {
    try {
      // 管理者向けのアラート送信関数
      const sendAlertToAdmins = async (alertMessage) => {
        try {
          // 管理者のLINEユーザーIDを設定（環境変数から取得）
          const adminUserIds = (process.env.LINE_ADMIN_USER_IDS || '').split(',').filter(id => id.trim());
          
          if (adminUserIds.length === 0) {
            logger.warn('No admin user IDs configured for LINE usage alerts');
            return;
          }

          // 各管理者にアラートを送信
          for (const adminUserId of adminUserIds) {
            try {
              await this.lineService.pushMessage(adminUserId.trim(), alertMessage);
              logger.info('LINE usage alert sent to admin', { adminUserId });
            } catch (error) {
              logger.error('Failed to send LINE usage alert to admin', {
                adminUserId,
                error: error.message
              });
            }
          }
        } catch (error) {
          logger.error('Failed to send LINE usage alerts to admins', {
            error: error.message
          });
        }
      };

      // 監視を開始（1時間ごとにチェック）
      this.lineUsageMonitor.startMonitoring(sendAlertToAdmins, 60);
      
      logger.info('LINE usage monitoring started');
    } catch (error) {
      logger.error('Failed to start LINE usage monitoring', {
        error: error.message
      });
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
      pendingMessages: this.pendingMessages.length,
      lineLimitStatus: lineLimitHandler.getLimitStatus(),
      lineUsageMonitoring: this.lineUsageMonitor.getMonitoringStatus(),
      messageMappings: this.messageMappingManager.getStats()
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
      this.lineUsageMonitor.stopMonitoring();
      
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
