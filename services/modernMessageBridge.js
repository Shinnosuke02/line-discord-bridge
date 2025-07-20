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
    let channel;
    try {
      channel = await this.discord.channels.fetch(channelId);
    } catch (error) {
      if (error.code === 10003 || (error.message && error.message.includes('Unknown Channel'))) {
        logger.info('Channel not found, creating new channel', { channelId });
        channel = await this.createChannel(channelId);
        
        // チャンネル作成に失敗した場合
        if (!channel) {
          logger.error('Failed to create channel, cannot send message', { channelId });
          return;
        }
      } else {
        logger.error('Failed to fetch Discord channel', { channelId, error: error.message });
        throw error;
      }
    }

    try {
      // メッセージ内容のチェック（ファイルがある場合はcontentが空でもOK）
      if (!message.content || message.content.trim() === '') {
        if (!message.files || message.files.length === 0) {
          logger.warn('Attempted to send empty message to Discord', {
            channelId: channel.id,
            hasFiles: false
          });
          return;
        } else {
          // ファイルがある場合は空のcontentでも送信
          logger.debug('Sending file-only message to Discord', {
            channelId: channel.id,
            fileCount: message.files.length
          });
        }
      }

      let sentMessage;
      
      if (message.files && message.files.length > 0) {
        logger.info('Preparing to send files to Discord', {
          channelId: channel.id,
          fileCount: message.files.length,
          fileNames: message.files.map(f => f.name || f.attachment?.name || 'unknown')
        });
        
        // ファイル付きメッセージを送信
        sentMessage = await channel.send({
          content: message.content || '',
          files: message.files
        });
      } else {
        // テキストのみのメッセージを送信
        sentMessage = await channel.send(message.content || '');
      }

      logger.info('Message sent to Discord successfully', {
        channelId: channel.id,
        channelId: sentMessage.id,
        channelName: channel.name,
        guildName: channel.guild?.name,
        contentLength: message.content?.length || 0,
        hasFiles: !!(message.files && message.files.length > 0),
        fileCount: message.files?.length || 0,
        sentMessageAttachments: sentMessage.attachments?.size || 0
      });
    } catch (error) {
      logger.error('Failed to send message to Discord', {
        channelId,
        error: error.message,
        stack: error.stack,
      });
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
            // スタンプの正しい画像URLを取得
            const stickerImageUrl = `https://cdn.discordapp.com/stickers/${sticker.id}.png`;
            
                      // Discordスタンプをテキストメッセージとして送信
          const stickerInfo = `sent a sticker: ${sticker.name}`;
          await this.lineService.pushMessage(lineUserId, {
            type: 'text',
            text: stickerInfo
          });
          
                    logger.info('Discord sticker sent as text message', {
            stickerId: sticker.id,
            stickerName: sticker.name
          });
          } catch (stickerError) {
            logger.error('Failed to send Discord sticker as image', {
              stickerId: sticker.id,
              error: stickerError.message
            });
            // フォールバック: テキストメッセージ
            const stickerInfo = `sent a sticker: ${sticker.name}`;
            await this.lineService.pushMessage(lineUserId, {
              type: 'text',
              text: stickerInfo
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
   * Discordチャンネルを作成
   * @param {string} channelId - チャンネルID（存在しない場合）
   * @returns {Object} 作成されたチャンネル
   */
  async createChannel(channelId) {
    try {
      // ギルドを取得
      const guild = this.discord.guilds.cache.first();
      if (!guild) {
        throw new Error('No guild available for channel creation');
      }

      // Botの権限を確認
      const botMember = guild.members.cache.get(this.discord.user.id);
      if (!botMember || !botMember.permissions.has('ManageChannels')) {
        throw new Error('Bot does not have permission to create channels');
      }

      // チャンネル名を生成
      const channelName = `line-bridge-${Date.now()}`;
      
      // テキストチャンネルを作成
      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // テキストチャンネル
        reason: 'LINE-Discord Bridge channel creation'
      });

      logger.info('Created new Discord channel', {
        channelId: channel.id,
        channelName: channel.name,
        guildId: guild.id,
        guildName: guild.name
      });

      // マッピングを更新
      await this.updateMappingChannelId(channelId, channel.id, channel.name, guild.name);

      return channel;
    } catch (error) {
      logger.error('Failed to create Discord channel', {
        originalChannelId: channelId,
        error: error.message,
        stack: error.stack
      });
      // エラーを再throwせず、nullを返して上位で処理
      return null;
    }
  }



  /**
   * マッピングのチャンネルIDを更新
   * @param {string} oldChannelId - 古いチャンネルID
   * @param {string} newChannelId - 新しいチャンネルID
   * @param {string} channelName - チャンネル名称（省略可）
   * @param {string} guildName - サーバー名称（省略可）
   */
  async updateMappingChannelId(oldChannelId, newChannelId, channelName = null, guildName = null) {
    try {
      const fs = require('fs').promises;
      const mappingPath = './mapping.json';
      
      // マッピングファイルを読み込み
      const mappingData = await fs.readFile(mappingPath, 'utf8');
      const mappings = JSON.parse(mappingData);
      
      // 該当するマッピングを更新
      const mapping = mappings.find(m => m.discordChannelId === oldChannelId);
      if (mapping) {
        mapping.discordChannelId = newChannelId;
        mapping.updatedAt = new Date().toISOString();
        
        // 名称情報を追加
        if (channelName) {
          mapping.discordChannelName = channelName;
        }
        if (guildName) {
          mapping.discordGuildName = guildName;
        }
        
        // ファイルに保存
        await fs.writeFile(mappingPath, JSON.stringify(mappings, null, 2));
        
        logger.info('Updated mapping channel ID', {
          oldChannelId,
          newChannelId,
          channelName,
          guildName,
          mappingId: mapping.id
        });
      } else {
        logger.warn('No mapping found to update', { oldChannelId, newChannelId });
      }
    } catch (error) {
      logger.error('Failed to update mapping channel ID', {
        oldChannelId,
        newChannelId,
        error: error.message
      });
      // マッピング更新に失敗してもチャンネル作成は成功しているので、エラーは再throwしない
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