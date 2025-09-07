const { Client: LineClient } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * LINE Bot API v7対応の近代化されたLineService
 * 外部URLを使用したメディア送信に対応
 */
class ModernLineService {
  constructor() {
    this.client = new LineClient(config.line);
  }

  /**
   * ユーザープロフィールを取得
   * @param {string} userId - ユーザーID
   * @returns {Promise<Object>} プロフィール情報
   */
  async getUserProfile(userId) {
    try {
      const profile = await this.client.getProfile(userId);
      logger.debug('User profile retrieved', { userId, displayName: profile.displayName });
      return profile;
    } catch (error) {
      logger.error('Failed to get user profile', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * グループメンバープロフィールを取得
   * @param {string} groupId - グループID
   * @param {string} userId - ユーザーID
   * @returns {Promise<Object>} メンバープロフィール
   */
  async getGroupMemberProfile(groupId, userId) {
    try {
      const member = await this.client.getGroupMemberProfile(groupId, userId);
      logger.debug('Group member profile retrieved', { groupId, userId, displayName: member.displayName });
      return member;
    } catch (error) {
      logger.error('Failed to get group member profile', { groupId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * グループ概要を取得
   * @param {string} groupId - グループID
   * @returns {Promise<Object>} グループ概要
   */
  async getGroupSummary(groupId) {
    try {
      const group = await this.client.getGroupSummary(groupId);
      logger.debug('Group summary retrieved', { groupId, groupName: group.groupName });
      return group;
    } catch (error) {
      logger.error('Failed to get group summary', { groupId, error: error.message });
      throw error;
    }
  }

  /**
   * 単一メッセージを送信
   * @param {string} userId - ユーザーID
   * @param {Object} message - メッセージオブジェクト
   * @returns {Promise<Object>} 送信結果
   */
  async pushMessage(userId, message) {
    try {
      logger.debug('Sending message to LINE', { userId, messageType: message.type });
      const result = await this.client.pushMessage(userId, message);
      logger.info('Message sent to LINE successfully', { userId, messageType: message.type });
      return result;
    } catch (error) {
      logger.error('Failed to send message to LINE', { 
        userId, 
        messageType: message.type,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 複数メッセージを送信
   * @param {string} userId - ユーザーID
   * @param {Array} messages - メッセージ配列
   * @returns {Promise<Array>} 送信結果配列
   */
  async pushMessages(userId, messages) {
    try {
      logger.debug('Sending multiple messages to LINE', { 
        userId, 
        messageCount: messages.length 
      });
      
      // LINE APIの制限: 一度に最大5つのメッセージ
      const maxMessagesPerRequest = 5;
      const results = [];
      
      for (let i = 0; i < messages.length; i += maxMessagesPerRequest) {
        const batch = messages.slice(i, i + maxMessagesPerRequest);
        const result = await this.client.pushMessage(userId, batch);
        results.push(result);
        
        // バッチ間に少し待機（レート制限対策）
        if (i + maxMessagesPerRequest < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logger.info('Multiple messages sent to LINE successfully', { 
        userId, 
        totalMessages: messages.length,
        batches: results.length 
      });
      return results;
    } catch (error) {
      logger.error('Failed to send multiple messages to LINE', { 
        userId, 
        messageCount: messages.length,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 表示名を取得（統合版）
   * @param {Object} event - LINEイベント
   * @returns {Promise<string>} 表示名
   */
  async getDisplayName(event) {
    const sourceId = event.source.groupId || event.source.userId;
    const senderId = event.source.userId;
    const isGroup = !!event.source.groupId;

    try {
      if (isGroup) {
        try {
          const member = await this.getGroupMemberProfile(sourceId, senderId);
          return member.displayName;
        } catch {
          const group = await this.getGroupSummary(sourceId);
          return group.groupName || `group-${sourceId.slice(0, 8)}`;
        }
      } else {
        const profile = await this.getUserProfile(senderId);
        return profile.displayName;
      }
    } catch (error) {
      logger.error('Failed to get display name', { 
        sourceId, 
        senderId, 
        isGroup,
        error: error.message 
      });
      // フォールバック: ユーザーIDを使用
      return `user-${senderId.slice(0, 8)}`;
    }
  }

  /**
   * メッセージタイプに応じた説明を取得
   * @param {string} type - メッセージタイプ
   * @returns {string} 説明
   */
  getMessageTypeDescription(type) {
    const descriptions = {
      'text': 'テキスト',
      'image': '画像',
      'video': '動画',
      'audio': '音声',
      'file': 'ファイル',
      'location': '位置情報',
      'sticker': 'スタンプ',
    };
    return descriptions[type] || type;
  }

  /**
   * 外部URLを使用した画像送信（LINE Bot API v7対応）
   * @param {string} userId - ユーザーID
   * @param {string} imageUrl - 画像URL
   * @param {string} previewUrl - プレビュー画像URL（省略可）
   * @returns {Promise<Object>} 送信結果
   */
  async sendImageByUrl(userId, imageUrl, previewUrl = null) {
    try {
      const message = {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: previewUrl || imageUrl,
      };
      
      logger.debug('Sending image to LINE via URL', { 
        userId, 
        imageUrl: imageUrl.substring(0, 100) + '...',
        hasPreview: !!previewUrl 
      });
      
      const result = await this.pushMessage(userId, message);
      logger.info('Image sent to LINE via URL successfully', { userId });
      return result;
    } catch (error) {
      logger.error('Failed to send image to LINE via URL', { 
        userId, 
        imageUrl: imageUrl.substring(0, 100) + '...',
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 外部URLを使用した動画送信（LINE Bot API v7対応）
   * @param {string} userId - ユーザーID
   * @param {string} videoUrl - 動画URL
   * @param {string} previewUrl - プレビュー画像URL（省略可）
   * @returns {Promise<Object>} 送信結果
   */
  async sendVideoByUrl(userId, videoUrl, previewUrl = null) {
    try {
      const message = {
        type: 'video',
        originalContentUrl: videoUrl,
        previewImageUrl: previewUrl || videoUrl,
      };
      
      logger.debug('Sending video to LINE via URL', { 
        userId, 
        videoUrl: videoUrl.substring(0, 100) + '...',
        hasPreview: !!previewUrl 
      });
      
      const result = await this.pushMessage(userId, message);
      logger.info('Video sent to LINE via URL successfully', { userId });
      return result;
    } catch (error) {
      logger.error('Failed to send video to LINE via URL', { 
        userId, 
        videoUrl: videoUrl.substring(0, 100) + '...',
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 外部URLを使用した音声送信（LINE Bot API v7対応）
   * @param {string} userId - ユーザーID
   * @param {string} audioUrl - 音声URL
   * @param {number} duration - 音声の長さ（ミリ秒）
   * @returns {Promise<Object>} 送信結果
   */
  async sendAudioByUrl(userId, audioUrl, duration = 0) {
    try {
      const message = {
        type: 'audio',
        originalContentUrl: audioUrl,
        duration: duration,
      };
      
      logger.debug('Sending audio to LINE via URL', { 
        userId, 
        audioUrl: audioUrl.substring(0, 100) + '...',
        duration 
      });
      
      const result = await this.pushMessage(userId, message);
      logger.info('Audio sent to LINE via URL successfully', { userId });
      return result;
    } catch (error) {
      logger.error('Failed to send audio to LINE via URL', { 
        userId, 
        audioUrl: audioUrl.substring(0, 100) + '...',
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * メッセージをフォーマット（テキストメッセージ用）
   * @param {Object} event - LINEイベント
   * @param {string} displayName - 表示名
   * @returns {string} フォーマットされたメッセージ
   */
  formatMessage(event, displayName) {
    const type = event.message.type;
    const label = `**${displayName}**`;

    if (type === 'text') {
      return `${label}: ${event.message.text}`;
    } else {
      const description = this.getMessageTypeDescription(type);
      return `${label} sent a ${description} message.`;
    }
  }
}

module.exports = ModernLineService; 