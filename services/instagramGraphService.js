const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Instagram Graph APIサービス
 * ビジネスアカウントのメッセージを処理
 */
class InstagramGraphService {
  constructor() {
    this.accessToken = config.instagram.graphAccessToken;
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Instagramビジネスアカウント情報を取得
   * @param {string} accountId - InstagramアカウントID
   * @returns {Object} アカウント情報
   */
  async getBusinessAccountInfo(accountId) {
    try {
      const response = await axios.get(`${this.baseUrl}/${accountId}`, {
        params: {
          fields: 'id,username,account_type,media_count,followers_count,follows_count',
          access_token: this.accessToken
        }
      });

      logger.info('Instagram business account info retrieved', {
        accountId: accountId,
        username: response.data.username
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get Instagram business account info', {
        accountId: accountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Instagramメッセージを取得
   * @param {string} accountId - InstagramアカウントID
   * @param {number} limit - 取得件数
   * @returns {Array} メッセージ一覧
   */
  async getMessages(accountId, limit = 10) {
    try {
      const response = await axios.get(`${this.baseUrl}/${accountId}/messages`, {
        params: {
          fields: 'id,from,to,message,created_time,attachments',
          limit: limit,
          access_token: this.accessToken
        }
      });

      logger.info('Instagram messages retrieved', {
        accountId: accountId,
        messageCount: response.data.data?.length || 0
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Failed to get Instagram messages', {
        accountId: accountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Instagramコメントを取得
   * @param {string} mediaId - メディアID
   * @returns {Array} コメント一覧
   */
  async getComments(mediaId) {
    try {
      const response = await axios.get(`${this.baseUrl}/${mediaId}/comments`, {
        params: {
          fields: 'id,text,from,created_time',
          access_token: this.accessToken
        }
      });

      logger.info('Instagram comments retrieved', {
        mediaId: mediaId,
        commentCount: response.data.data?.length || 0
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Failed to get Instagram comments', {
        mediaId: mediaId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Instagram投稿を取得
   * @param {string} accountId - InstagramアカウントID
   * @param {number} limit - 取得件数
   * @returns {Array} 投稿一覧
   */
  async getMedia(accountId, limit = 10) {
    try {
      const response = await axios.get(`${this.baseUrl}/${accountId}/media`, {
        params: {
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
          limit: limit,
          access_token: this.accessToken
        }
      });

      logger.info('Instagram media retrieved', {
        accountId: accountId,
        mediaCount: response.data.data?.length || 0
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Failed to get Instagram media', {
        accountId: accountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージをLINEに送信
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} message - メッセージオブジェクト
   */
  async pushMessage(lineUserId, message) {
    try {
      // LINEサービスを使用してメッセージを送信
      const lineService = require('./modernLineService');
      await lineService.pushMessage(lineUserId, message);

      logger.info('Instagram Graph message sent to LINE', {
        lineUserId: lineUserId,
        messageType: message.type
      });
    } catch (error) {
      logger.error('Failed to send Instagram Graph message to LINE', {
        lineUserId: lineUserId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Instagram Graph API Webhook署名を検証
   * @param {string} signature - 署名
   * @param {string} body - リクエストボディ
   * @returns {boolean} 検証結果
   */
  verifySignature(signature, body) {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.instagram.appSecret)
        .update(body, 'utf8')
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error('Failed to verify Instagram Graph signature', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * 定期的なメッセージ取得（ポーリング）
   * @param {string} accountId - InstagramアカウントID
   * @param {Function} callback - メッセージ処理コールバック
   */
  async pollMessages(accountId, callback) {
    try {
      const messages = await this.getMessages(accountId, 5);
      
      for (const message of messages) {
        try {
          await callback(message);
        } catch (error) {
          logger.error('Failed to process polled message', {
            messageId: message.id,
            error: error.message
          });
        }
      }

      logger.info('Instagram message polling completed', {
        accountId: accountId,
        processedCount: messages.length
      });
    } catch (error) {
      logger.error('Failed to poll Instagram messages', {
        accountId: accountId,
        error: error.message
      });
    }
  }
}

module.exports = InstagramGraphService; 