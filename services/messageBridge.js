/**
 * メッセージブリッジサービス
 */
const LineService = require('./lineService');
const MediaService = require('./mediaService');
const logger = require('../utils/logger');

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
   * DiscordからLINEへのメッセージ処理
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
      logger.debug('No user mapping found for channel', { channelId: message.channel.id });
      return;
    }

    try {
      const messages = [];

      // テキストメッセージの処理
      if (message.content && message.content.trim()) {
        // URLを検出して埋め込み画像を処理
        const urlMessages = await this.mediaService.processUrls(message.content);
        messages.push(...urlMessages);

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
        const attachmentMessages = await this.mediaService.processDiscordAttachments(
          Array.from(message.attachments.values())
        );
        messages.push(...attachmentMessages);
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
      await this.handleDiscordToLine(message);
    });

    logger.info('Discord message listener set up');
  }
}

module.exports = MessageBridge; 