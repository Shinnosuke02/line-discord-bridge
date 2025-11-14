/**
 * Webhook管理サービス
 * Discord Webhookを使用したメッセージ送信を管理
 */
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Webhook管理クラス
 */
class WebhookManager {
  constructor(discordClient) {
    this.discord = discordClient;
    this.webhooks = new Map();
    this.isInitialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    try {
      this.isInitialized = true;
      logger.info('WebhookManager initialized');
    } catch (error) {
      logger.error('Failed to initialize WebhookManager', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * チャンネルのWebhookを取得または作成
   * @param {string} channelId - チャンネルID
   * @returns {Object} Webhook
   */
  async getOrCreateWebhook(channelId) {
    try {
      const desiredName = process.env.WEBHOOK_NAME?.trim() || 'LINE Bridge';
      // キャッシュされたWebhookを確認
      if (this.webhooks.has(channelId)) {
        const webhook = this.webhooks.get(channelId);
        // Webhookが有効か確認
        if (await this.validateWebhook(webhook)) {
          return webhook;
        } else {
          // 無効なWebhookを削除
          this.webhooks.delete(channelId);
        }
      }

      // チャンネルを取得
      const channel = await this.discord.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      // 既存のWebhookを検索
      const existingWebhooks = await channel.fetchWebhooks();
      const bridgeWebhook = existingWebhooks.find(webhook => 
        webhook.name === desiredName
      );

      let webhook;
      if (bridgeWebhook) {
        webhook = bridgeWebhook;
      } else {
        // 新しいWebhookを作成
        webhook = await channel.createWebhook({
          name: desiredName,
          avatar: null,
          reason: 'LINE-Discord Bridge webhook'
        });
      }

      // Webhookをキャッシュ
      this.webhooks.set(channelId, webhook);

      logger.debug('Webhook obtained for channel', {
        channelId,
        webhookId: webhook.id,
        webhookUrl: webhook.url,
        name: desiredName
      });

      return webhook;
    } catch (error) {
      logger.error('Failed to get or create webhook', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Webhookが有効か確認
   * @param {Object} webhook - Webhook
   * @returns {boolean} 有効かどうか
   */
  async validateWebhook(webhook) {
    try {
      // Webhookの存在確認
      await webhook.fetch();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Webhookを使用してメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {Object} message - メッセージ
   * @param {string} username - ユーザー名
   * @param {string} avatarUrl - アバターURL
   * @param {string} replyToMessageId - 返信先のメッセージID（オプショナル）
   * @returns {Object} 送信されたメッセージ
   */
  async sendMessage(channelId, message, username, avatarUrl = null, replyToMessageId = null) {
    try {
      if (!config.webhook.enabled) {
        throw new Error('Webhook is disabled');
      }

      const webhook = await this.getOrCreateWebhook(channelId);
      
      const webhookMessage = {
        content: message.content,
        username: username,
        avatarURL: avatarUrl,
        files: message.files || []
      };

      // 返信先メッセージIDが指定されている場合、返信として送信
      if (replyToMessageId) {
        webhookMessage.messageReference = {
          messageId: replyToMessageId
        };
      }

      logger.debug('Sending webhook message', {
        channelId,
        username,
        avatarURL: avatarUrl,
        hasFiles: (message.files || []).length > 0,
        isReply: !!replyToMessageId,
        replyToMessageId
      });

      const sentMessage = await webhook.send(webhookMessage);

      logger.debug('Message sent via webhook', {
        channelId,
        webhookId: webhook.id,
        messageId: sentMessage.id,
        username,
        isReply: !!replyToMessageId
      });

      return sentMessage;
    } catch (error) {
      logger.error('Failed to send message via webhook', {
        channelId,
        username,
        isReply: !!replyToMessageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Webhookを使用して埋め込みメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {Object} embed - 埋め込みメッセージ
   * @param {string} username - ユーザー名
   * @param {string} avatarUrl - アバターURL
   * @returns {Object} 送信されたメッセージ
   */
  async sendEmbed(channelId, embed, username, avatarUrl = null) {
    try {
      if (!config.webhook.enabled) {
        throw new Error('Webhook is disabled');
      }

      const webhook = await this.getOrCreateWebhook(channelId);
      
      const webhookMessage = {
        embeds: [embed],
        username: username,
        avatarURL: avatarUrl
      };

      const sentMessage = await webhook.send(webhookMessage);

      logger.debug('Embed sent via webhook', {
        channelId,
        webhookId: webhook.id,
        messageId: sentMessage.id,
        username
      });

      return sentMessage;
    } catch (error) {
      logger.error('Failed to send embed via webhook', {
        channelId,
        username,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Webhookを削除
   * @param {string} channelId - チャンネルID
   * @returns {boolean} 削除成功
   */
  async deleteWebhook(channelId) {
    try {
      const webhook = this.webhooks.get(channelId);
      if (webhook) {
        await webhook.delete('LINE-Discord Bridge cleanup');
        this.webhooks.delete(channelId);
        
        logger.info('Webhook deleted', {
          channelId,
          webhookId: webhook.id
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to delete webhook', {
        channelId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * チャンネルのWebhookをクリーンアップ
   * @param {string} channelId - チャンネルID
   * @returns {number} 削除されたWebhook数
   */
  async cleanupChannelWebhooks(channelId) {
    try {
      const channel = await this.discord.channels.fetch(channelId);
      if (!channel) {
        return 0;
      }

      const webhooks = await channel.fetchWebhooks();
      const bridgeWebhooks = webhooks.filter(webhook => 
        webhook.name === 'LINE-Discord Bridge'
      );

      let deletedCount = 0;
      for (const webhook of bridgeWebhooks) {
        try {
          await webhook.delete('LINE-Discord Bridge cleanup');
          deletedCount++;
        } catch (error) {
          logger.warn('Failed to delete webhook', {
            webhookId: webhook.id,
            error: error.message
          });
        }
      }

      // キャッシュからも削除
      this.webhooks.delete(channelId);

      logger.info('Channel webhooks cleaned up', {
        channelId,
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup channel webhooks', {
        channelId,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * すべてのWebhookをクリーンアップ
   * @returns {number} 削除されたWebhook数
   */
  async cleanupAllWebhooks() {
    try {
      let totalDeleted = 0;
      
      for (const [channelId, webhook] of this.webhooks) {
        try {
          await webhook.delete('LINE-Discord Bridge cleanup');
          totalDeleted++;
        } catch (error) {
          logger.warn('Failed to delete webhook', {
            channelId,
            webhookId: webhook.id,
            error: error.message
          });
        }
      }

      this.webhooks.clear();

      logger.info('All webhooks cleaned up', {
        deletedCount: totalDeleted
      });

      return totalDeleted;
    } catch (error) {
      logger.error('Failed to cleanup all webhooks', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Webhookの統計を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      cachedWebhooks: this.webhooks.size,
      isInitialized: this.isInitialized,
      webhookEnabled: config.webhook.enabled
    };
  }

  /**
   * 停止処理
   */
  async stop() {
    try {
      // Webhookのクリーンアップは行わない（他の用途で使用される可能性があるため）
      this.webhooks.clear();
      this.isInitialized = false;
      logger.info('WebhookManager stopped');
    } catch (error) {
      logger.error('Failed to stop WebhookManager', {
        error: error.message
      });
    }
  }
}

module.exports = WebhookManager;
