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
      const result = await this.client.pushMessage(userId, messageArray);
      
      logger.debug('LINE message sent', {
        userId,
        messageCount: messageArray.length,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send LINE message', {
        userId,
        error: error.message
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
      const result = await this.client.replyMessage(replyToken, messageArray);
      
      logger.debug('LINE reply sent', {
        replyToken,
        messageCount: messageArray.length,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send LINE reply', {
        replyToken,
        error: error.message
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
      const profile = await this.client.getProfile(userId);
      
      logger.debug('LINE user profile retrieved', {
        userId,
        displayName: profile.displayName
      });
      
      return profile;
    } catch (error) {
      logger.error('Failed to get LINE user profile', {
        userId,
        error: error.message
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
      const profile = await this.client.getGroupMemberProfile(groupId, userId);
      
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
        error: error.message
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
      const summary = await this.client.getGroupSummary(groupId);
      
      logger.debug('LINE group summary retrieved', {
        groupId,
        groupName: summary.groupName
      });
      
      return summary;
    } catch (error) {
      logger.error('Failed to get LINE group summary', {
        groupId,
        error: error.message
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
      const stream = await this.client.getMessageContent(messageId);
      
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
        error: error.message
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
        return `**${displayName}**: ${message.text}`;
        
      case 'sticker':
        return `**${displayName}** sent a sticker`;
        
      case 'image':
        return `**${displayName}** sent an image`;
        
      case 'video':
        return `**${displayName}** sent a video`;
        
      case 'audio':
        return `**${displayName}** sent an audio message`;
        
      case 'file':
        return `**${displayName}** sent a file: ${message.fileName || 'Unknown file'}`;
        
      case 'location':
        return `**${displayName}** sent a location`;
        
      default:
        return `**${displayName}** sent a ${message.type} message`;
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
      const result = await this.client.linkRichMenuToUser(userId, richMenuId);
      
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
        error: error.message
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
      const result = await this.client.unlinkRichMenuFromUser(userId);
      
      logger.debug('LINE rich menu unlinked from user', {
        userId,
        result
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to unlink LINE rich menu from user', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = LineService;
