/**
 * Discordチャンネル管理サービス
 */
const fs = require('fs');
const { ChannelType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const MappingManager = require('./mappingManager');

class ChannelManager {
  constructor(discordClient) {
    this.discordClient = discordClient;
    this.mappingManager = new MappingManager();
    this.userChannelMap = this.loadUserChannelMap();
    
    // 既存のマッピングを新しいシステムに移行
    this.migrateExistingMappings();
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
   * 既存のマッピングを新しいシステムに移行
   */
  migrateExistingMappings() {
    try {
      const existingMappings = Object.entries(this.userChannelMap);
      if (existingMappings.length > 0) {
        logger.info('Migrating existing mappings to new system', { count: existingMappings.length });
        
        existingMappings.forEach(([userId, channelId]) => {
          // 既存のマッピングを新しいシステムに追加
          this.mappingManager.addMapping(userId, channelId, `User-${userId}`, 'user');
        });
        
        logger.info('Migration completed');
      }
    } catch (error) {
      logger.error('Failed to migrate existing mappings', error);
    }
  }

  /**
   * ユーザーチャンネルマッピングを保存（後方互換性のため保持）
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
   * @param {string} type - チャンネルタイプ ('user' | 'group')
   * @returns {Promise<string>} チャンネルID
   */
  async getOrCreateChannel(displayName, userId, type = 'user') {
    try {
      const guild = await this.discordClient.guilds.fetch(config.discord.guildId);
      
      // 新しいマッピングシステムで既存のチャンネルをチェック
      const existingDiscordChannelId = this.mappingManager.getDiscordChannelId(userId);
      
      if (existingDiscordChannelId) {
        const exists = await this.channelExists(existingDiscordChannelId, guild);
        if (exists) {
          logger.debug('Using existing channel from mapping system', { 
            userId, 
            channelId: existingDiscordChannelId 
          });
          return existingDiscordChannelId;
        } else {
          logger.warn('Stored channel not found, removing from mapping', { 
            userId, 
            channelId: existingDiscordChannelId 
          });
          // マッピングから削除（MappingManagerで実装予定）
        }
      }

      // 新しいチャンネルを作成
      const channelName = this.generateAvailableChannelName(displayName, guild);
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        reason: `LINE ${type} ${displayName}`,
      });

      // 新しいマッピングシステムに保存
      this.mappingManager.addMapping(userId, newChannel.id, displayName, type);
      
      // 後方互換性のため古いシステムにも保存
      this.userChannelMap[userId] = newChannel.id;
      this.saveUserChannelMap();

      logger.info('Created new Discord channel', {
        userId,
        displayName,
        channelId: newChannel.id,
        channelName: newChannel.name,
        type
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
    // 新しいマッピングシステムを優先
    const discordChannelId = this.mappingManager.getDiscordChannelId(userId);
    if (discordChannelId) {
      return discordChannelId;
    }
    
    // 後方互換性のため古いシステムもチェック
    return this.userChannelMap[userId] || null;
  }

  /**
   * チャンネルIDからユーザーIDを取得
   * @param {string} channelId - チャンネルID
   * @returns {string|null} ユーザーID
   */
  getUserIdByChannelId(channelId) {
    // 新しいマッピングシステムを優先
    const lineChannelId = this.mappingManager.getLineChannelId(channelId);
    if (lineChannelId) {
      return lineChannelId;
    }
    
    // 後方互換性のため古いシステムもチェック
    return Object.keys(this.userChannelMap).find(key => this.userChannelMap[key] === channelId) || null;
  }

  /**
   * マッピング統計を取得
   * @returns {Object} 統計情報
   */
  getMappingStats() {
    return this.mappingManager.getStats();
  }

  /**
   * すべてのマッピングを取得
   * @returns {Array} マッピング配列
   */
  getAllMappings() {
    return this.mappingManager.getAllMappings();
  }
}

module.exports = ChannelManager; 