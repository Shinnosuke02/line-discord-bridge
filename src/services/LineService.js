/**
 * LINE Bot API サービス
 * LINE Bot SDKを使用したLINE API操作を管理
 */
const { Client } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * LINEサービスクラス
 */
class LineService {
  constructor() {
    this.client = new Client({
      channelAccessToken: config.line.channelAccessToken,
      channelSecret: config.line.channelSecret
    });
    
    // レート制限管理
    this.rateLimitInfo = {
      lastRequestTime: 0,
      requestCount: 0,
      windowStart: Date.now(),
      maxRequestsPerSecond: 10, // 安全マージンを持って10リクエスト/秒に制限
      maxRequestsPerMinute: 500 // 1分間に500リクエスト制限
    };
  }

  /**
   * レート制限をチェックし、必要に応じて待機
   */
  async checkRateLimit() {
    const now = Date.now();
    
    // ウィンドウをリセット（1分ごと）
    if (now - this.rateLimitInfo.windowStart > 60000) {
      this.rateLimitInfo.windowStart = now;
      this.rateLimitInfo.requestCount = 0;
    }
    
    // 1秒あたりの制限チェック
    const timeSinceLastRequest = now - this.rateLimitInfo.lastRequestTime;
    if (timeSinceLastRequest < 100) { // 100ms待機（10リクエスト/秒）
      await new Promise(resolve => setTimeout(resolve, 100 - timeSinceLastRequest));
    }
    
    // 1分あたりの制限チェック
    if (this.rateLimitInfo.requestCount >= this.rateLimitInfo.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.rateLimitInfo.windowStart);
      if (waitTime > 0) {
        logger.warn('Rate limit reached, waiting', { waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.rateLimitInfo.windowStart = Date.now();
        this.rateLimitInfo.requestCount = 0;
      }
    }
    
    this.rateLimitInfo.lastRequestTime = Date.now();
    this.rateLimitInfo.requestCount++;
  }

  /**
   * リトライ機能付きでAPI呼び出しを実行
   * @param {Function} apiCall - API呼び出し関数
   * @param {number} maxRetries - 最大リトライ回数
   * @returns {Object} API結果
   */
  async executeWithRetry(apiCall, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.checkRateLimit();
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // 429エラー（レート制限）の場合
        if (error.status === 429 || (error.response && error.response.status === 429)) {
          const retryAfter = error.response?.headers?.['retry-after'] || Math.pow(2, attempt) * 1000;
          logger.warn('Rate limit hit, retrying after delay', {
            attempt,
            retryAfter,
            maxRetries
          });
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            continue;
          }
        }
        
        // その他のエラーの場合、即座に失敗
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * メッセージを送信
   * @param {string} userId - ユーザーID
   * @param {Object|Array} messages - メッセージ
   * @returns {Object} 送信結果
   */
  async pushMessage(userId, messages) {
    try {
      const messageArray = Array.isArray(messages) ? messages : [messages];
      
      const result = await this.executeWithRetry(async () => {
        return await this.client.pushMessage(userId, messageArray);
      });
      
      logger.debug('LINE message sent', {
        userId,
        messageCount: messageArray.length,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send LINE message', {
        userId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * リプライメッセージを送信
   * @param {string} replyToken - リプライトークン
   * @param {Object|Array} messages - メッセージ
   * @returns {Object} 送信結果
   */
  async replyMessage(replyToken, messages) {
    try {
      const messageArray = Array.isArray(messages) ? messages : [messages];
      
      const result = await this.executeWithRetry(async () => {
        return await this.client.replyMessage(replyToken, messageArray);
      });
      
      logger.debug('LINE reply sent', {
        replyToken,
        messageCount: messageArray.length,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send LINE reply', {
        replyToken,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * ユーザープロフィールを取得
   * @param {string} userId - ユーザーID
   * @returns {Object} プロフィール
   */
  async getUserProfile(userId) {
    try {
      const profile = await this.executeWithRetry(async () => {
        return await this.client.getProfile(userId);
      });
      
      logger.debug('LINE user profile retrieved', {
        userId,
        displayName: profile.displayName
      });
      
      return profile;
    } catch (error) {
      logger.error('Failed to get LINE user profile', {
        userId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * グループメンバープロフィールを取得
   * @param {string} groupId - グループID
   * @param {string} userId - ユーザーID
   * @returns {Object} プロフィール
   */
  async getGroupMemberProfile(groupId, userId) {
    try {
      const profile = await this.executeWithRetry(async () => {
        return await this.client.getGroupMemberProfile(groupId, userId);
      });
      
      logger.debug('LINE group member profile retrieved', {
        groupId,
        userId,
        displayName: profile.displayName
      });
      
      return profile;
    } catch (error) {
      logger.error('Failed to get LINE group member profile', {
        groupId,
        userId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * グループ情報を取得
   * @param {string} groupId - グループID
   * @returns {Object} グループ情報
   */
  async getGroupSummary(groupId) {
    try {
      const summary = await this.executeWithRetry(async () => {
        return await this.client.getGroupSummary(groupId);
      });
      
      logger.debug('LINE group summary retrieved', {
        groupId,
        groupName: summary.groupName
      });
      
      return summary;
    } catch (error) {
      logger.error('Failed to get LINE group summary', {
        groupId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * メッセージコンテンツを取得
   * @param {string} messageId - メッセージID
   * @returns {Buffer} メッセージコンテンツ
   */
  async getMessageContent(messageId) {
    try {
      const stream = await this.executeWithRetry(async () => {
        return await this.client.getMessageContent(messageId);
      });
      
      // StreamをBufferに変換
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      
      logger.debug('LINE message content retrieved', {
        messageId,
        size: buffer.length
      });
      
      return buffer;
    } catch (error) {
      logger.error('Failed to get LINE message content', {
        messageId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * 表示名を取得
   * @param {Object} event - LINEイベント
   * @returns {string} 表示名
   */
  async getDisplayName(event) {
    try {
      if (event.source.groupId) {
        const profile = await this.getGroupMemberProfile(
          event.source.groupId,
          event.source.userId
        );
        return profile.displayName || 'Unknown User';
      } else {
        const profile = await this.getUserProfile(event.source.userId);
        return profile.displayName || 'Unknown User';
      }
    } catch (error) {
      logger.warn('Failed to get display name, using fallback', {
        userId: event.source.userId,
        error: error.message
      });
      return 'Unknown User';
    }
  }

  /**
   * メッセージをフォーマット
   * @param {Object} event - LINEイベント
   * @param {string} displayName - 表示名
   * @returns {string} フォーマットされたメッセージ
   */
  formatMessage(event, displayName) {
    const message = event.message;
    
    switch (message.type) {
      case 'text':
        return message.text;
        
      case 'sticker':
        return '😊 Sticker';
        
      case 'image':
        return '📷 Image message';
        
      case 'video':
        return '🎥 Video message';
        
      case 'audio':
        return '🎵 Audio message';
        
      case 'file':
        return `📎 File: ${message.fileName || 'Unknown file'}`;
        
      case 'location':
        const { latitude, longitude, address } = message;
        const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const addressText = address ? `\n📍 住所: ${address}` : '';
        return `📍 位置情報${addressText}\n🌐 Googleマップ: ${googleMapsUrl}\n📊 座標: ${latitude}, ${longitude}`;
        
      default:
        return `Unsupported message type: ${message.type}`;
    }
  }

  /**
   * リッチメニューを設定
   * @param {string} userId - ユーザーID
   * @param {string} richMenuId - リッチメニューID
   * @returns {Object} 設定結果
   */
  async linkRichMenuToUser(userId, richMenuId) {
    try {
      const result = await this.executeWithRetry(async () => {
        return await this.client.linkRichMenuToUser(userId, richMenuId);
      });
      
      logger.debug('LINE rich menu linked to user', {
        userId,
        richMenuId,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to link LINE rich menu to user', {
        userId,
        richMenuId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }

  /**
   * リッチメニューを解除
   * @param {string} userId - ユーザーID
   * @returns {Object} 解除結果
   */
  async unlinkRichMenuFromUser(userId) {
    try {
      const result = await this.executeWithRetry(async () => {
        return await this.client.unlinkRichMenuFromUser(userId);
      });
      
      logger.debug('LINE rich menu unlinked from user', {
        userId,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to unlink LINE rich menu from user', {
        userId,
        error: error.message,
        status: error.status || error.response?.status
      });
      throw error;
    }
  }
}

module.exports = LineService;
