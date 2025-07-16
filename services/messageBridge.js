/**
 * メッセージブリッジサービス
 */
const LineService = require('./lineService');
const logger = require('../utils/logger');

class MessageBridge {
  constructor(discordClient, channelManager) {
    this.discordClient = discordClient;
    this.channelManager = channelManager;
    this.lineService = new LineService();
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

      // メッセージをフォーマットして送信
      const formattedMessage = this.lineService.formatMessage(event, displayName);
      await channel.send(formattedMessage);

      logger.info('Message forwarded from LINE to Discord', {
        sourceId,
        senderId,
        displayName,
        channelId,
        messageType: event.message.type,
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
      // テキストメッセージのみを処理
      if (message.content && message.content.trim()) {
        await this.lineService.pushMessage(userId, {
          type: 'text',
          text: message.content,
        });

        logger.info('Message forwarded from Discord to LINE', {
          userId,
          channelId: message.channel.id,
          authorId: message.author.id,
          authorName: message.author.username,
        });
      }
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