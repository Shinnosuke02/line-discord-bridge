/**
 * Discordチャンネル管理サービス
 */
const fs = require('fs');
const { ChannelType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

class ChannelManager {
  constructor(discordClient) {
    this.discordClient = discordClient;
    this.userChannelMap = this.loadUserChannelMap();
  }

  /**
   * ユーザーチャンネルマッピングを読み込み
   * @returns {Object} ユーザーチャンネルマッピング
   */
  loadUserChannelMap() {
    try {
      if (fs.existsSync(config.files.userChannelMap)) {
        const data = fs.readFileSync(config.files.userChannelMap, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load user channel map', error);
    }
    return {};
  }

  /**
   * ユーザーチャンネルマッピングを保存
   */
  saveUserChannelMap() {
    try {
      fs.writeFileSync(
        config.files.userChannelMap,
        JSON.stringify(this.userChannelMap, null, 2)
      );
      logger.debug('User channel map saved');
    } catch (error) {
      logger.error('Failed to save user channel map', error);
    }
  }

  /**
   * チャンネル名を正規化
   * @param {string} displayName - 表示名
   * @returns {string} 正規化されたチャンネル名
   */
  normalizeChannelName(displayName) {
    return displayName
      .replace(/[^\p{L}\p{N}_\-]/gu, '-')
      .slice(0, config.channel.maxLength);
  }

  /**
   * 利用可能なチャンネル名を生成
   * @param {string} baseName - ベース名
   * @param {Object} guild - Discordギルド
   * @returns {string} 利用可能なチャンネル名
   */
  generateAvailableChannelName(baseName, guild) {
    const normalizedName = this.normalizeChannelName(baseName);
    
    for (let i = 1; i <= config.channel.maxSuffix; i++) {
      const suffix = `-${String(i).padStart(config.channel.suffixPadding, '0')}`;
      const proposedName = `${normalizedName}${suffix}`;
      
      if (!guild.channels.cache.find(channel => channel.name === proposedName)) {
        return proposedName;
      }
    }
    
    // 最大数に達した場合のフォールバック
    const timestamp = Date.now().toString().slice(-6);
    return `${normalizedName}-${timestamp}`;
  }

  /**
   * チャンネルが存在するかチェック
   * @param {string} channelId - チャンネルID
   * @param {Object} guild - Discordギルド
   * @returns {Promise<boolean>} チャンネルが存在するかどうか
   */
  async channelExists(channelId, guild) {
    try {
      await guild.channels.fetch(channelId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * チャンネルを取得または作成
   * @param {string} displayName - 表示名
   * @param {string} userId - ユーザーID
   * @returns {Promise<string>} チャンネルID
   */
  async getOrCreateChannel(displayName, userId) {
    try {
      const guild = await this.discordClient.guilds.fetch(config.discord.guildId);
      
      // 既存のチャンネルをチェック
      if (this.userChannelMap[userId]) {
        const exists = await this.channelExists(this.userChannelMap[userId], guild);
        if (exists) {
          logger.debug('Using existing channel', { userId, channelId: this.userChannelMap[userId] });
          return this.userChannelMap[userId];
        } else {
          logger.warn('Stored channel not found, removing from map', { userId, channelId: this.userChannelMap[userId] });
          delete this.userChannelMap[userId];
        }
      }

      // 新しいチャンネルを作成
      const channelName = this.generateAvailableChannelName(displayName, guild);
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        reason: `LINE user ${displayName}`,
      });

      this.userChannelMap[userId] = newChannel.id;
      this.saveUserChannelMap();

      logger.info('Created new Discord channel', {
        userId,
        displayName,
        channelId: newChannel.id,
        channelName: newChannel.name,
      });

      return newChannel.id;
    } catch (error) {
      logger.error('Failed to get or create channel', error);
      throw error;
    }
  }

  /**
   * ユーザーIDからチャンネルIDを取得
   * @param {string} userId - ユーザーID
   * @returns {string|null} チャンネルID
   */
  getChannelIdByUserId(userId) {
    return this.userChannelMap[userId] || null;
  }

  /**
   * チャンネルIDからユーザーIDを取得
   * @param {string} channelId - チャンネルID
   * @returns {string|null} ユーザーID
   */
  getUserIdByChannelId(channelId) {
    return Object.keys(this.userChannelMap).find(key => this.userChannelMap[key] === channelId) || null;
  }
}

module.exports = ChannelManager; 