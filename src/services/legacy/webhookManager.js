const logger = require('../utils/logger');
const config = require('../config');

/**
 * Discord Webhook管理クラス
 * LINEユーザーの表示名でメッセージを送信するための機能を提供
 */
class WebhookManager {
  constructor(discordClient) {
    this.discord = discordClient;
    this.webhooks = new Map(); // channelId -> webhook
    this.isInitialized = false;
  }

  /**
   * WebhookManagerを初期化
   */
  async initialize() {
    try {
      logger.info('Initializing WebhookManager');
      this.isInitialized = true;
      logger.info('WebhookManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebhookManager', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * チャンネルのWebhookを取得または作成
   * @param {string} channelId - DiscordチャンネルID
   * @param {string} webhookName - Webhook名
   * @returns {Promise<Object>} Webhookオブジェクト
   */
  async getOrCreateWebhook(channelId, webhookName = null) {
    // デフォルトのWebhook名を設定から取得
    if (!webhookName) {
      webhookName = config.webhook.name;
    }
    if (!this.isInitialized) {
      throw new Error('WebhookManager not initialized');
    }

    // キャッシュされたWebhookを確認
    if (this.webhooks.has(channelId)) {
      const cachedWebhook = this.webhooks.get(channelId);
      try {
        // Webhookが有効かチェック
        await cachedWebhook.fetch();
        return cachedWebhook;
      } catch (error) {
        logger.warn('Cached webhook is invalid, will create new one', {
          channelId,
          error: error.message
        });
        this.webhooks.delete(channelId);
      }
    }

    try {
      const channel = await this.discord.channels.fetch(channelId);
      
      // Botの権限を確認
      const botMember = channel.guild.members.cache.get(this.discord.user.id);
      if (!botMember) {
        throw new Error('Bot member not found in guild');
      }

      // Webhook作成権限を確認
      if (!botMember.permissions.has('ManageWebhooks')) {
        logger.warn('Bot does not have ManageWebhooks permission', {
          channelId,
          botId: this.discord.user.id,
          permissions: botMember.permissions.toArray()
        });
        throw new Error('Bot does not have ManageWebhooks permission');
      }

      // 既存のWebhookを検索
      const webhooks = await channel.fetchWebhooks();
      let webhook = webhooks.find(wh => wh.name === webhookName);

      if (!webhook) {
        // 新しいWebhookを作成
        logger.info('Creating new webhook', {
          channelId,
          channelName: channel.name,
          webhookName
        });
        
        webhook = await channel.createWebhook({
          name: webhookName,
          reason: 'LINE-Discord Bridge webhook creation'
        });
        
        logger.info('Created new webhook for channel', {
          channelId,
          webhookId: webhook.id,
          webhookName
        });
      } else {
        logger.info('Found existing webhook for channel', {
          channelId,
          webhookId: webhook.id,
          webhookName
        });
      }

      // キャッシュに保存
      this.webhooks.set(channelId, webhook);
      return webhook;
    } catch (error) {
      logger.error('Failed to get or create webhook', {
        channelId,
        webhookName,
        error: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * ユーザー名とアバターでメッセージを送信
   * @param {string} channelId - DiscordチャンネルID
   * @param {Object} message - メッセージオブジェクト
   * @param {string} username - 表示するユーザー名
   * @param {string} avatarUrl - アバターURL（省略可）
   * @returns {Promise<Object>} 送信されたメッセージ
   */
  async sendMessage(channelId, message, username, avatarUrl = null) {
    if (!this.isInitialized) {
      throw new Error('WebhookManager not initialized');
    }

    try {
      const webhook = await this.getOrCreateWebhook(channelId);
      
      const webhookMessage = {
        content: message.content || '',
        files: message.files || [],
        username: username,
        avatarURL: avatarUrl
      };

      const sentMessage = await webhook.send(webhookMessage);
      
      logger.info('Message sent via webhook', {
        channelId,
        messageId: sentMessage.id,
        username,
        contentLength: message.content?.length || 0,
        fileCount: message.files?.length || 0
      });

      return sentMessage;
    } catch (error) {
      logger.error('Failed to send message via webhook', {
        channelId,
        username,
        error: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * WebhookManagerを停止
   */
  async stop() {
    try {
      logger.info('Stopping WebhookManager');
      this.webhooks.clear();
      this.isInitialized = false;
      logger.info('WebhookManager stopped successfully');
    } catch (error) {
      logger.error('Failed to stop WebhookManager', {
        error: error.message
      });
    }
  }
}

module.exports = WebhookManager; 