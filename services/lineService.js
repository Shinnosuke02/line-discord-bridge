/**
 * LINEサービス
 */
const { Client: LineClient } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');

class LineService {
  constructor() {
    this.client = new LineClient(config.line);
  }

  /**
   * ユーザープロフィールを取得
   * @param {string} userId - ユーザーID
   * @returns {Promise<Object>} ユーザープロフィール
   */
  async getUserProfile(userId) {
    try {
      const profile = await this.client.getProfile(userId);
      logger.debug('Retrieved user profile', { userId, displayName: profile.displayName });
      return profile;
    } catch (error) {
      logger.error('Failed to get user profile', error);
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
      logger.debug('Retrieved group member profile', { groupId, userId, displayName: member.displayName });
      return member;
    } catch (error) {
      logger.error('Failed to get group member profile', error);
      throw error;
    }
  }

  /**
   * グループサマリーを取得
   * @param {string} groupId - グループID
   * @returns {Promise<Object>} グループサマリー
   */
  async getGroupSummary(groupId) {
    try {
      const group = await this.client.getGroupSummary(groupId);
      logger.debug('Retrieved group summary', { groupId, groupName: group.groupName });
      return group;
    } catch (error) {
      logger.error('Failed to get group summary', error);
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
      const result = await this.client.pushMessage(userId, message);
      logger.debug('Message sent to LINE', { userId, messageType: message.type });
      return result;
    } catch (error) {
      logger.error('Failed to send message to LINE', error);
      throw error;
    }
  }

  /**
   * 複数メッセージを送信
   * @param {string} userId - ユーザーID
   * @param {Array} messages - メッセージ配列
   * @returns {Promise<Object>} 送信結果
   */
  async pushMessages(userId, messages) {
    try {
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
      
      logger.debug('Multiple messages sent to LINE', { 
        userId, 
        totalMessages: messages.length,
        batches: results.length 
      });
      return results;
    } catch (error) {
      logger.error('Failed to send multiple messages to LINE', error);
      throw error;
    }
  }

  /**
   * 表示名を取得
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
      logger.error('Failed to get display name', error);
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
   * ファイルをLINE APIにアップロード
   * @param {Buffer} content - ファイル内容
   * @param {string} filename - ファイル名
   * @returns {Promise<string>} アップロードされたファイルのID
   */
  async uploadFile(content, filename) {
    try {
      logger.debug('Uploading file to LINE', { filename, size: content.length });
      
      // LINE APIにファイルをアップロード
      const result = await this.client.uploadContent(content, filename);
      
      logger.debug('File uploaded to LINE', { filename, messageId: result.messageId });
      return result.messageId;
    } catch (error) {
      logger.error('Failed to upload file to LINE', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 画像ファイルをLINEに送信
   * @param {string} userId - ユーザーID
   * @param {Buffer} content - 画像データ
   * @param {string} filename - ファイル名
   * @returns {Promise<Object>} 送信結果
   */
  async sendImage(userId, content, filename) {
    try {
      const messageId = await this.uploadFile(content, filename);
      
      const message = {
        type: 'image',
        originalContentUrl: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        previewImageUrl: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      };
      
      return await this.pushMessage(userId, message);
    } catch (error) {
      logger.error('Failed to send image to LINE', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 動画ファイルをLINEに送信
   * @param {string} userId - ユーザーID
   * @param {Buffer} content - 動画データ
   * @param {string} filename - ファイル名
   * @returns {Promise<Object>} 送信結果
   */
  async sendVideo(userId, content, filename) {
    try {
      const messageId = await this.uploadFile(content, filename);
      
      const message = {
        type: 'video',
        originalContentUrl: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        previewImageUrl: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      };
      
      return await this.pushMessage(userId, message);
    } catch (error) {
      logger.error('Failed to send video to LINE', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 音声ファイルをLINEに送信
   * @param {string} userId - ユーザーID
   * @param {Buffer} content - 音声データ
   * @param {string} filename - ファイル名
   * @returns {Promise<Object>} 送信結果
   */
  async sendAudio(userId, content, filename) {
    try {
      const messageId = await this.uploadFile(content, filename);
      
      const message = {
        type: 'audio',
        originalContentUrl: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        duration: 0, // Discordには音声の長さ情報がない
      };
      
      return await this.pushMessage(userId, message);
    } catch (error) {
      logger.error('Failed to send audio to LINE', { filename, error: error.message });
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

module.exports = LineService; 