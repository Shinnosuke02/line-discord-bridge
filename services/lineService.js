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
   * メッセージを送信
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
   * メッセージをフォーマット
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
      return `${label} sent a ${type} message.`;
    }
  }
}

module.exports = LineService; 