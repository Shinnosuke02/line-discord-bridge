const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const ModernLineService = require('./modernLineService');
const ModernMediaService = require('./modernMediaService');
const ModernFileProcessor = require('./modernFileProcessor');

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
    this.fileProcessor = new ModernFileProcessor();
    
    // レート制限対策
    this.messageQueue = [];
    this.isProcessingQueue = false;
    this.lastMessageTime = 0;
    this.minMessageInterval = 1000; // 1秒間隔
    
    this.setupEventHandlers();
  }

  /**
   * イベントハンドラーを設定
   */
  setupEventHandlers() {
    // Discord準備完了
    this.discord.once('ready', () => {
      logger.info('Modern Discord client is ready', {
        user: this.discord.user.tag,
        guilds: this.discord.guilds.cache.size
      });
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

    // マッピングを確認
    const mapping = await this.getMapping(message.channelId);
    if (!mapping) {
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
        lineUserId: mapping.lineUserId
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
      // マッピングを確認
      const mapping = await this.getMappingByLineUserId(event.source.userId);
      if (!mapping) {
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
          discordMessage = this.lineService.formatMessage(event, displayName);
          break;
          
        case 'image':
          discordMessage = await this.mediaService.processLineImage(event.message);
          break;
          
        case 'video':
          discordMessage = await this.mediaService.processLineVideo(event.message);
          break;
          
        case 'audio':
          discordMessage = await this.mediaService.processLineAudio(event.message);
          break;
          
        case 'file':
          discordMessage = await this.mediaService.processLineFile(event.message);
          break;
          
        case 'sticker':
          discordMessage = await this.mediaService.processLineSticker(event.message);
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
        
        logger.info('Message forwarded from LINE to Discord', {
          sourceId: event.source.groupId || event.source.userId,
          senderId: event.source.userId,
          displayName,
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
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const options = {};
      if (message.files && message.files.length > 0) {
        options.files = message.files;
      }

      await channel.send(message.content, options);
      
      logger.debug('Message sent to Discord', {
        channelId,
        contentLength: message.content?.length || 0,
        hasFiles: !!(message.files && message.files.length > 0)
      });
    } catch (error) {
      logger.error('Failed to send message to Discord', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージをキューに追加
   * @param {Object} messageData - メッセージデータ
   */
  async queueMessage(messageData) {
    this.messageQueue.push(messageData);
    
    if (!this.isProcessingQueue) {
      await this.processMessageQueue();
    }
  }

  /**
   * メッセージキューを処理
   */
  async processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const messageData = this.messageQueue.shift();
        
        // レート制限対策
        const now = Date.now();
        const timeSinceLastMessage = now - this.lastMessageTime;
        
        if (timeSinceLastMessage < this.minMessageInterval) {
          await new Promise(resolve => 
            setTimeout(resolve, this.minMessageInterval - timeSinceLastMessage)
          );
        }

        try {
          if (messageData.type === 'discord_to_line') {
            await this.processDiscordToLineMessage(messageData);
          }
        } catch (error) {
          logger.error('Failed to process queued message', {
            type: messageData.type,
            error: error.message
          });
        }

        this.lastMessageTime = Date.now();
      }
    } finally {
      this.isProcessingQueue = false;
    }
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
          const formattedMessage = `**${discordMessage.author.username}**: ${text}`;
          await this.lineService.pushMessage(lineUserId, {
            type: 'text',
            text: formattedMessage
          });
        }
      }

      // スタンプを処理
      if (discordMessage.stickers && discordMessage.stickers.size > 0) {
        for (const sticker of discordMessage.stickers.values()) {
          await this.lineService.pushMessage(lineUserId, {
            type: 'text',
            text: `**${discordMessage.author.username}** sent a sticker: ${sticker.name}`
          });
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
      const results = await this.mediaService.processDiscordAttachments(attachmentArray, lineUserId);
      
      logger.info('Discord attachments processed', {
        attachmentCount: attachmentArray.length,
        results: results.map(r => ({ success: r.success, type: r.type }))
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
   * DiscordチャンネルIDからマッピングを取得
   * @param {string} discordChannelId - DiscordチャンネルID
   * @returns {Object|null} マッピング情報
   */
  async getMapping(discordChannelId) {
    try {
      const mapping = require('../mapping.json');
      return mapping.find(m => m.discordChannelId === discordChannelId) || null;
    } catch (error) {
      logger.error('Failed to get mapping', { discordChannelId, error: error.message });
      return null;
    }
  }

  /**
   * LINEユーザーIDからマッピングを取得
   * @param {string} lineUserId - LINEユーザーID
   * @returns {Object|null} マッピング情報
   */
  async getMappingByLineUserId(lineUserId) {
    try {
      const mapping = require('../mapping.json');
      return mapping.find(m => m.lineUserId === lineUserId) || null;
    } catch (error) {
      logger.error('Failed to get mapping by LINE user ID', { lineUserId, error: error.message });
      return null;
    }
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