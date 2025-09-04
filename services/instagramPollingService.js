const InstagramGraphService = require('./instagramGraphService');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Instagramポーリングサービス
 * 既存アカウントのメッセージを定期的に取得
 */
class InstagramPollingService {
  constructor() {
    this.graphService = new InstagramGraphService();
    this.pollingInterval = null;
    this.lastMessageId = null;
    this.isPolling = false;
  }

  /**
   * ポーリングを開始
   * @param {string} accountId - InstagramアカウントID
   * @param {Function} messageCallback - メッセージ処理コールバック
   * @param {number} intervalMinutes - ポーリング間隔（分）
   */
  async startPolling(accountId, messageCallback, intervalMinutes = 5) {
    if (this.isPolling) {
      logger.warn('Instagram polling is already running');
      return;
    }

    this.isPolling = true;
    logger.info('Starting Instagram message polling', {
      accountId: accountId,
      intervalMinutes: intervalMinutes
    });

    // 初回実行
    await this.pollMessages(accountId, messageCallback);

    // 定期的なポーリングを開始
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollMessages(accountId, messageCallback);
      } catch (error) {
        logger.error('Error during Instagram polling', {
          error: error.message
        });
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * ポーリングを停止
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    logger.info('Instagram polling stopped');
  }

  /**
   * メッセージをポーリング
   * @param {string} accountId - InstagramアカウントID
   * @param {Function} messageCallback - メッセージ処理コールバック
   */
  async pollMessages(accountId, messageCallback) {
    try {
      const messages = await this.graphService.getMessages(accountId, 10);
      
      // 新しいメッセージのみ処理
      const newMessages = messages.filter(message => {
        if (!this.lastMessageId) {
          return true;
        }
        return message.id !== this.lastMessageId;
      });

      if (newMessages.length > 0) {
        logger.info('New Instagram messages found', {
          accountId: accountId,
          newMessageCount: newMessages.length
        });

        // 新しいメッセージを処理
        for (const message of newMessages.reverse()) { // 古い順に処理
          try {
            await messageCallback(message);
            this.lastMessageId = message.id;
          } catch (error) {
            logger.error('Failed to process Instagram message', {
              messageId: message.id,
              error: error.message
            });
          }
        }
      } else {
        logger.debug('No new Instagram messages', {
          accountId: accountId
        });
      }

    } catch (error) {
      logger.error('Failed to poll Instagram messages', {
        accountId: accountId,
        error: error.message
      });
    }
  }

  /**
   * コメントをポーリング
   * @param {string} mediaId - メディアID
   * @param {Function} commentCallback - コメント処理コールバック
   */
  async pollComments(mediaId, commentCallback) {
    try {
      const comments = await this.graphService.getComments(mediaId);
      
      logger.info('Instagram comments polled', {
        mediaId: mediaId,
        commentCount: comments.length
      });

      for (const comment of comments) {
        try {
          await commentCallback(comment);
        } catch (error) {
          logger.error('Failed to process Instagram comment', {
            commentId: comment.id,
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Failed to poll Instagram comments', {
        mediaId: mediaId,
        error: error.message
      });
    }
  }

  /**
   * 投稿をポーリング
   * @param {string} accountId - InstagramアカウントID
   * @param {Function} mediaCallback - メディア処理コールバック
   */
  async pollMedia(accountId, mediaCallback) {
    try {
      const media = await this.graphService.getMedia(accountId, 5);
      
      logger.info('Instagram media polled', {
        accountId: accountId,
        mediaCount: media.length
      });

      for (const item of media) {
        try {
          await mediaCallback(item);
        } catch (error) {
          logger.error('Failed to process Instagram media', {
            mediaId: item.id,
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Failed to poll Instagram media', {
        accountId: accountId,
        error: error.message
      });
    }
  }

  /**
   * ポーリング状態を取得
   * @returns {Object} ポーリング状態
   */
  getStatus() {
    return {
      isPolling: this.isPolling,
      lastMessageId: this.lastMessageId,
      hasInterval: !!this.pollingInterval
    };
  }
}

module.exports = InstagramPollingService; 