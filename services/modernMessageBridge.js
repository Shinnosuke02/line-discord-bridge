const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const ModernLineService = require('./modernLineService');
const ModernMediaService = require('./modernMediaService');
const ChannelManager = require('./channelManager');

/**
 * 近代化されたメッセージブリッジ
 * LINE Bot API v7対応、より堅牢なエラーハンドリング
 */
class ModernMessageBridge {
  constructor() {
    this.discord = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    
    this.lineService = new ModernLineService();
    this.mediaService = new ModernMediaService();
    this.channelManager = null; // Discordログイン後に初期化
    
    // 初期化中のメッセージキュー
    this.pendingMessages = [];
    this.isInitialized = false;
    
    this.setupEventHandlers();
  }

  /**
   * イベントハンドラーを設定
   */
  setupEventHandlers() {
    // Discord準備完了
    this.discord.once('ready', async () => {
      logger.info('Modern Discord client is ready', {
        user: this.discord.user.tag,
        guilds: this.discord.guilds.cache.size
      });
      
      // ChannelManagerを初期化
      this.channelManager = new ChannelManager(this.discord);
      await this.channelManager.initialize();
      
      // 初期化完了
      this.isInitialized = true;
      
      // 保留中のメッセージを処理
      await this.processPendingMessages();
    });

    // Discordメッセージ受信
    this.discord.on('messageCreate', async (message) => {
      try {
        await this.handleDiscordToLine(message);
      } catch (error) {
        logger.error('Failed to handle Discord message', {
          messageId: message.id,
          channelId: message.channelId,
          error: error.message,
          stack: error.stack
        });
      }
    });

    // Discordエラー
    this.discord.on('error', (error) => {
      logger.error('Discord client error', { error: error.message });
    });

    // Discord警告
    this.discord.on('warn', (warning) => {
      logger.warn('Discord client warning', { warning });
    });
  }

  /**
   * DiscordメッセージをLINEに転送
   * @param {Object} message - Discordメッセージ
   */
  async handleDiscordToLine(message) {
    // ボット自身のメッセージは無視
    if (message.author.bot) {
      return;
    }

    // 初期化されていない場合はキューに追加
    if (!this.isInitialized || !this.channelManager || !this.channelManager.isInitialized) {
      logger.info('System not initialized, queuing Discord message', { messageId: message.id });
      this.pendingMessages.push({ type: 'discord', message });
      return;
    }

    // LINEユーザーIDを取得
    const lineUserId = await this.channelManager.getLineUserId(message.channelId);
    if (!lineUserId) {
      return;
    }

    logger.info('Processing Discord message', {
      channelId: message.channelId,
      authorName: message.author.username,
      summary: this.summarizeMessage(message)
    });

    try {
      // メッセージをキューに追加
      await this.queueMessage({
        type: 'discord_to_line',
        discordMessage: message,
        lineUserId: lineUserId
      });
    } catch (error) {
      logger.error('Failed to queue Discord message', {
        messageId: message.id,
        error: error.message
      });
    }
  }

  /**
   * LINEメッセージをDiscordに転送
   * @param {Object} event - LINEイベント
   */
  async handleLineToDiscord(event) {
    try {
      // 初期化されていない場合はキューに追加
      if (!this.isInitialized || !this.channelManager || !this.channelManager.isInitialized) {
        logger.info('System not initialized, queuing LINE message', { 
          lineUserId: event.source.userId 
        });
        this.pendingMessages.push({ type: 'line', event });
        return;
      }

      // チャンネルを取得または作成
      const mapping = await this.channelManager.getOrCreateChannel(event.source.userId);
      if (!mapping) {
        logger.error('Failed to get or create channel for LINE user', {
          lineUserId: event.source.userId
        });
        return;
      }

      logger.info('Processing LINE message', {
        sourceId: event.source.groupId || event.source.userId,
        senderId: event.source.userId,
        messageType: event.message?.type || 'unknown'
      });

      // 表示名を取得
      const displayName = await this.lineService.getDisplayName(event);
      
      // メッセージタイプに応じて処理
      let discordMessage = null;
      
      switch (event.message.type) {
        case 'text':
          discordMessage = {
            content: this.lineService.formatMessage(event, displayName)
          };
          break;
          
        case 'image':
          logger.info('Processing LINE image message', {
            messageId: event.message.id
          });
          const imageResult = await this.mediaService.processLineImage(event.message);
          discordMessage = {
            content: `**${displayName}**: ${imageResult.content}`,
            files: imageResult.files || []
          };
          logger.info('Image processing result', {
            messageId: event.message.id,
            hasContent: !!discordMessage?.content,
            hasFiles: !!(discordMessage?.files && discordMessage.files.length > 0),
            content: discordMessage?.content?.substring(0, 100)
          });
          break;
          
        case 'video':
          const videoResult = await this.mediaService.processLineVideo(event.message);
          discordMessage = {
            content: `**${displayName}**: ${videoResult.content}`,
            files: videoResult.files || []
          };
          break;
          
        case 'audio':
          const audioResult = await this.mediaService.processLineAudio(event.message);
          discordMessage = {
            content: `**${displayName}**: ${audioResult.content}`,
            files: audioResult.files || []
          };
          break;
          
        case 'file':
          const fileResult = await this.mediaService.processLineFile(event.message);
          discordMessage = {
            content: `**${displayName}**: ${fileResult.content}`,
            files: fileResult.files || []
          };
          break;
          
        case 'sticker':
          logger.info('Processing LINE sticker message', {
            messageId: event.message.id,
            packageId: event.message.packageId,
            stickerId: event.message.stickerId
          });
          const stickerResult = await this.mediaService.processLineSticker(event.message);
          discordMessage = {
            content: `**${displayName}**: ${stickerResult.content}`,
            files: stickerResult.files || []
          };
          logger.info('Sticker processing result', {
            messageId: event.message.id,
            hasContent: !!discordMessage?.content,
            hasFiles: !!(discordMessage?.files && discordMessage.files.length > 0),
            content: discordMessage?.content?.substring(0, 100),
            fileCount: discordMessage?.files?.length || 0,
            stickerResult: {
              hasContent: !!stickerResult?.content,
              hasFiles: !!(stickerResult?.files && stickerResult.files.length > 0),
              content: stickerResult?.content?.substring(0, 100)
            }
          });
          break;
          
        case 'location':
          discordMessage = {
            content: `**${displayName}** sent a location message.`,
          };
          break;
          
        default:
          discordMessage = {
            content: `**${displayName}** sent an unsupported message type: ${event.message.type}`,
          };
      }

      // Discordに送信
      if (discordMessage) {
        await this.sendToDiscord(mapping.discordChannelId, discordMessage);
        
        // グループ名称を取得
        let groupName = null;
        if (event.source.groupId) {
          try {
            const group = await this.lineService.getGroupSummary(event.source.groupId);
            groupName = group.groupName;
          } catch (error) {
            logger.debug('Failed to get group name', { groupId: event.source.groupId });
          }
        }

        logger.info('Message forwarded from LINE to Discord', {
          sourceId: event.source.groupId || event.source.userId,
          senderId: event.source.userId,
          displayName,
          groupName,
          channelId: mapping.discordChannelId,
          messageType: event.message?.type || 'unknown'
        });
      }
    } catch (error) {
      logger.error('Failed to handle LINE message', {
        eventId: event.message?.id,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Discordにメッセージを送信
   * @param {string} channelId - DiscordチャンネルID
   * @param {Object} message - メッセージオブジェクト
   */
  async sendToDiscord(channelId, message) {
    try {
      const channel = await this.discord.channels.fetch(channelId);
      
      // シンプルな送信
      const sentMessage = await channel.send({
        content: message.content || '',
        files: message.files || []
      });

      logger.info('Message sent to Discord', {
        channelId: channel.id,
        messageId: sentMessage.id,
        contentLength: message.content?.length || 0,
        fileCount: message.files?.length || 0
      });
    } catch (error) {
      logger.error('Failed to send message to Discord', {
        channelId,
        error: error.message
      });
    }
  }

  /**
   * メッセージをキューに追加
   * @param {Object} messageData - メッセージデータ
   */
  async queueMessage(messageData) {
    await this.processDiscordToLineMessage(messageData);
  }

  /**
   * Discord→LINEメッセージを処理
   * @param {Object} messageData - メッセージデータ
   */
  async processDiscordToLineMessage(messageData) {
    const { discordMessage, lineUserId } = messageData;
    
    try {
      // 添付ファイルを処理
      if (discordMessage.attachments && discordMessage.attachments.size > 0) {
        await this.processAttachments(discordMessage.attachments, lineUserId);
      }

      // テキストメッセージを処理
      if (discordMessage.content && discordMessage.content.trim()) {
        const text = discordMessage.content.trim();
        
        // URLを検出して処理
        const urlResults = await this.mediaService.processUrls(text, lineUserId);
        
        // URLが含まれていない場合のみテキストメッセージを送信
        if (urlResults.length === 0) {
          await this.lineService.pushMessage(lineUserId, {
            type: 'text',
            text: text
          });
        }
        // URLが含まれている場合は、URL処理で送信されるため、テキストメッセージは送信しない
      }

      // スタンプを処理
      if (discordMessage.stickers && discordMessage.stickers.size > 0) {
        for (const sticker of discordMessage.stickers.values()) {
          logger.info('Processing Discord sticker', {
            stickerId: sticker.id,
            stickerName: sticker.name,
            stickerDescription: sticker.description,
            stickerUrl: sticker.url
          });
          
          // Discordスタンプを処理
          try {
                        // スタンプの正しい画像URLを取得（元の成功していた方法）
            const stickerImageUrl = `https://cdn.discordapp.com/stickers/${sticker.id}.png`;
            
            // Discordスタンプを画像として送信（元の成功していた方法）
            await this.lineService.sendImageByUrl(lineUserId, stickerImageUrl);
            
            logger.info('Discord sticker sent to LINE as image', {
              stickerId: sticker.id,
              stickerName: sticker.name,
              imageUrl: stickerImageUrl
            });
                      } catch (stickerError) {
              logger.error('Failed to send Discord sticker', {
                stickerId: sticker.id,
                error: stickerError.message
              });
            }
        }
      }

    } catch (error) {
      logger.error('Failed to process Discord to LINE message', {
        messageId: discordMessage.id,
        error: error.message
      });
    }
  }

  /**
   * Discord添付ファイルを処理
   * @param {Collection} attachments - Discord添付ファイルコレクション
   * @param {string} lineUserId - LINEユーザーID
   */
  async processAttachments(attachments, lineUserId) {
    try {
      const attachmentArray = Array.from(attachments.values());
      await this.mediaService.processDiscordAttachments(attachmentArray, lineUserId);
      
      logger.info('Discord attachments processed', {
        attachmentCount: attachmentArray.length
      });
    } catch (error) {
      logger.error('Failed to process Discord attachments', {
        error: error.message
      });
    }
  }

  /**
   * メッセージの概要を生成
   * @param {Object} message - Discordメッセージ
   * @returns {string} 概要
   */
  summarizeMessage(message) {
    const parts = [];
    
    if (message.content) {
      parts.push(`${message.content.length} chars`);
    }
    
    if (message.attachments && message.attachments.size > 0) {
      parts.push(`${message.attachments.size} attachment(s)`);
    }
    
    if (message.stickers && message.stickers.size > 0) {
      parts.push(`${message.stickers.size} sticker(s)`);
    }
    
    return parts.join(', ') || 'empty message';
  }



  /**
   * Discordクライアントにログイン
   */
  async login() {
    try {
      await this.discord.login(config.discord.botToken);
      logger.info('Modern Discord client logged in successfully');
    } catch (error) {
      logger.error('Failed to login to Discord', { error: error.message });
      throw error;
    }
  }

  /**
   * ブリッジを開始
   */
  async start() {
    try {
      await this.login();
      logger.info('Modern MessageBridge started successfully');
    } catch (error) {
      logger.error('Failed to start Modern MessageBridge', { error: error.message });
      throw error;
    }
  }







  /**
   * 保留中のメッセージを処理
   */
  async processPendingMessages() {
    if (this.pendingMessages.length === 0) {
      return;
    }

    logger.info('Processing pending messages', { count: this.pendingMessages.length });

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const pendingMessage of messages) {
      try {
        if (pendingMessage.type === 'discord') {
          await this.handleDiscordToLine(pendingMessage.message);
        } else if (pendingMessage.type === 'line') {
          await this.handleLineToDiscord(pendingMessage.event);
        }
      } catch (error) {
        logger.error('Failed to process pending message', {
          type: pendingMessage.type,
          error: error.message
        });
      }
    }

    logger.info('Pending messages processed', { processedCount: messages.length });
  }

  /**
   * ブリッジを停止
   */
  async stop() {
    try {
      await this.discord.destroy();
      logger.info('Modern MessageBridge stopped successfully');
    } catch (error) {
      logger.error('Failed to stop Modern MessageBridge', { error: error.message });
    }
  }
}

module.exports = ModernMessageBridge; 