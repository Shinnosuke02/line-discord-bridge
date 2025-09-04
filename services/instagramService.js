const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Instagramメッセージ処理サービス
 * Instagram Basic Display APIを使用してメッセージを処理
 */
class InstagramService {
  constructor() {
    this.accessToken = config.instagram.accessToken;
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Instagramユーザー情報を取得
   * @param {string} userId - InstagramユーザーID
   * @returns {Object} ユーザー情報
   */
  async getUserInfo(userId) {
    try {
      const response = await axios.get(`${this.baseUrl}/${userId}`, {
        params: {
          fields: 'id,username,account_type,media_count',
          access_token: this.accessToken
        }
      });

      logger.info('Instagram user info retrieved', {
        userId: userId,
        username: response.data.username
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get Instagram user info', {
        userId: userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * InstagramメッセージをLINEに送信
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} message - メッセージオブジェクト
   */
  async pushMessage(lineUserId, message) {
    try {
      // LINEサービスを使用してメッセージを送信
      const lineService = require('./modernLineService');
      await lineService.pushMessage(lineUserId, message);

      logger.info('Instagram message sent to LINE', {
        lineUserId: lineUserId,
        messageType: message.type
      });
    } catch (error) {
      logger.error('Failed to send Instagram message to LINE', {
        lineUserId: lineUserId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Instagramメッセージを処理
   * @param {Object} event - Instagramイベント
   * @returns {Object} 処理されたメッセージ
   */
  async processMessage(event) {
    try {
      const { sender, message } = event;
      
      logger.info('Processing Instagram message', {
        senderId: sender.id,
        messageType: message.type
      });

      let processedMessage = {
        type: 'text',
        text: ''
      };

      switch (message.type) {
        case 'text':
          processedMessage = {
            type: 'text',
            text: message.text
          };
          break;

        case 'image':
          processedMessage = {
            type: 'image',
            originalContentUrl: message.url,
            previewImageUrl: message.url
          };
          break;

        case 'video':
          processedMessage = {
            type: 'video',
            originalContentUrl: message.url,
            previewImageUrl: message.thumbnail_url
          };
          break;

        case 'audio':
          processedMessage = {
            type: 'audio',
            originalContentUrl: message.url,
            duration: message.duration
          };
          break;

        case 'file':
          processedMessage = {
            type: 'file',
            fileName: message.file_name,
            originalContentUrl: message.url
          };
          break;

        default:
          processedMessage = {
            type: 'text',
            text: `Instagramから${message.type}タイプのメッセージを受信しました`
          };
      }

      return {
        sender: sender,
        message: processedMessage,
        timestamp: event.timestamp
      };

    } catch (error) {
      logger.error('Failed to process Instagram message', {
        error: error.message,
        event: event
      });
      throw error;
    }
  }

  /**
   * Instagram Webhook署名を検証
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
      logger.error('Failed to verify Instagram signature', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Instagram Webhookチャレンジを処理
   * @param {string} challenge - チャレンジ文字列
   * @returns {string} チャレンジ応答
   */
  handleWebhookChallenge(challenge) {
    logger.info('Instagram webhook challenge received', {
      challenge: challenge
    });
    return challenge;
  }
}

module.exports = InstagramService; 