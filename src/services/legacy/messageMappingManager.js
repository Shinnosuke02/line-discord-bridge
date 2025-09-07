const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * メッセージマッピング管理サービス
 * LINEとDiscordのメッセージIDを相互にマッピングして返信機能を実現
 */
class MessageMappingManager {
  constructor() {
    this.mappingsPath = './data/message-mappings.json';
    this.replyMappingsPath = './data/reply-mappings.json';
    this.maxMappings = 10000; // 最大保持件数
  }

  /**
   * 初期化
   */
  async initialize() {
    try {
      await this.ensureDataDirectory();
      await this.loadMappings();
      logger.info('MessageMappingManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MessageMappingManager', { error: error.message });
      throw error;
    }
  }

  /**
   * データディレクトリの確保
   */
  async ensureDataDirectory() {
    try {
      await fs.mkdir('./data', { recursive: true });
    } catch (error) {
      logger.error('Failed to create data directory', { error: error.message });
      throw error;
    }
  }

  /**
   * マッピングデータの読み込み
   */
  async loadMappings() {
    try {
      // メッセージマッピングの読み込み
      try {
        const mappingsData = await fs.readFile(this.mappingsPath, 'utf8');
        this.mappings = JSON.parse(mappingsData);
      } catch (error) {
        this.mappings = [];
      }

      // 返信マッピングの読み込み
      try {
        const replyData = await fs.readFile(this.replyMappingsPath, 'utf8');
        this.replyMappings = JSON.parse(replyData);
      } catch (error) {
        this.replyMappings = [];
      }

      logger.debug('Mappings loaded', {
        messageMappings: this.mappings.length,
        replyMappings: this.replyMappings.length
      });
    } catch (error) {
      logger.error('Failed to load mappings', { error: error.message });
      throw error;
    }
  }

  /**
   * マッピングデータの保存
   */
  async saveMappings() {
    try {
      await fs.writeFile(this.mappingsPath, JSON.stringify(this.mappings, null, 2));
      await fs.writeFile(this.replyMappingsPath, JSON.stringify(this.replyMappings, null, 2));
      logger.debug('Mappings saved successfully');
    } catch (error) {
      logger.error('Failed to save mappings', { error: error.message });
      throw error;
    }
  }

  /**
   * LINEメッセージIDをDiscordメッセージIDにマッピング
   * @param {string} lineMessageId - LINEメッセージID
   * @param {string} discordMessageId - DiscordメッセージID
   * @param {string} lineUserId - LINEユーザーID
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async mapLineToDiscord(lineMessageId, discordMessageId, lineUserId, discordChannelId) {
    const mapping = {
      id: `line_${lineMessageId}`,
      lineMessageId,
      discordMessageId,
      lineUserId,
      discordChannelId,
      timestamp: new Date().toISOString(),
      direction: 'line_to_discord'
    };

    this.mappings.push(mapping);
    await this.cleanupOldMappings();
    await this.saveMappings();

    logger.debug('LINE to Discord mapping created', {
      lineMessageId,
      discordMessageId,
      lineUserId,
      discordChannelId
    });
  }

  /**
   * DiscordメッセージIDをLINEメッセージIDにマッピング
   * @param {string} discordMessageId - DiscordメッセージID
   * @param {string} lineMessageId - LINEメッセージID
   * @param {string} lineUserId - LINEユーザーID
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async mapDiscordToLine(discordMessageId, lineMessageId, lineUserId, discordChannelId) {
    const mapping = {
      id: `discord_${discordMessageId}`,
      lineMessageId,
      discordMessageId,
      lineUserId,
      discordChannelId,
      timestamp: new Date().toISOString(),
      direction: 'discord_to_line'
    };

    this.mappings.push(mapping);
    await this.cleanupOldMappings();
    await this.saveMappings();

    logger.debug('Discord to LINE mapping created', {
      discordMessageId,
      lineMessageId,
      lineUserId,
      discordChannelId
    });
  }

  /**
   * LINEメッセージIDからDiscordメッセージIDを取得
   * @param {string} lineMessageId - LINEメッセージID
   * @returns {string|null} DiscordメッセージID
   */
  getDiscordMessageId(lineMessageId) {
    const mapping = this.mappings.find(m => m.lineMessageId === lineMessageId);
    return mapping ? mapping.discordMessageId : null;
  }

  /**
   * DiscordメッセージIDからLINEメッセージIDを取得
   * @param {string} discordMessageId - DiscordメッセージID
   * @returns {string|null} LINEメッセージID
   */
  getLineMessageId(discordMessageId) {
    const mapping = this.mappings.find(m => m.discordMessageId === discordMessageId);
    return mapping ? mapping.lineMessageId : null;
  }

  /**
   * 返信関係を記録
   * @param {string} originalMessageId - 元のメッセージID（LINEまたはDiscord）
   * @param {string} replyMessageId - 返信メッセージID（LINEまたはDiscord）
   * @param {string} platform - プラットフォーム（'line'または'discord'）
   */
  async recordReply(originalMessageId, replyMessageId, platform) {
    const replyMapping = {
      id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalMessageId,
      replyMessageId,
      platform,
      timestamp: new Date().toISOString()
    };

    this.replyMappings.push(replyMapping);
    await this.cleanupOldMappings();
    await this.saveMappings();

    logger.debug('Reply mapping recorded', {
      originalMessageId,
      replyMessageId,
      platform
    });
  }

  /**
   * 返信先のメッセージIDを取得
   * @param {string} messageId - メッセージID
   * @param {string} platform - プラットフォーム
   * @returns {string|null} 返信先のメッセージID
   */
  getReplyTarget(messageId, platform) {
    const replyMapping = this.replyMappings.find(r => 
      r.replyMessageId === messageId && r.platform === platform
    );
    return replyMapping ? replyMapping.originalMessageId : null;
  }

  /**
   * 古いマッピングを削除
   */
  async cleanupOldMappings() {
    // メッセージマッピングのクリーンアップ
    if (this.mappings.length > this.maxMappings) {
      this.mappings = this.mappings
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, this.maxMappings);
    }

    // 返信マッピングのクリーンアップ
    if (this.replyMappings.length > this.maxMappings) {
      this.replyMappings = this.replyMappings
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, this.maxMappings);
    }
  }

  /**
   * マッピング統計を取得
   */
  getStats() {
    return {
      messageMappings: this.mappings.length,
      replyMappings: this.replyMappings.length,
      lineToDiscordMappings: this.mappings.filter(m => m.direction === 'line_to_discord').length,
      discordToLineMappings: this.mappings.filter(m => m.direction === 'discord_to_line').length
    };
  }
}

module.exports = MessageMappingManager;
