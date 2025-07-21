/**
 * Discordチャンネル管理サービス
 */
const logger = require('../utils/logger');
const config = require('../config');
const { ChannelManagerError, ErrorCodes } = require('./errors');
const ModernLineService = require('./modernLineService');

class ChannelManager {
  constructor(discordClient, lineService) {
    this.discord = discordClient;
    this.lineService = lineService;
    this.mappings = new Map(); // メモリ内キャッシュ
    this.mappingPath = './mapping.json';
    this.isInitialized = false;
  }

  /**
   * 初期化（非同期）
   */
  async initialize() {
    await this.loadMappings();
    this.isInitialized = true;
    logger.info('ChannelManager initialized successfully');
  }

  /**
   * マッピングファイルを読み込み
   */
  async loadMappings() {
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(this.mappingPath, 'utf8');
      const mappings = JSON.parse(data);
      
      // メモリ内キャッシュに格納
      this.mappings.clear();
      mappings.forEach(mapping => {
        this.mappings.set(mapping.lineUserId, mapping);
        this.mappings.set(mapping.discordChannelId, mapping);
      });
      
      logger.info('Mappings loaded', { count: mappings.length });
    } catch (error) {
      logger.warn('Failed to load mappings, starting with empty cache', { error: error.message });
      this.mappings.clear();
    }
  }

  /**
   * マッピングファイルを保存
   */
  async saveMappings() {
    try {
      const fs = require('fs').promises;
      const mappings = [];
      
      // ユニークなマッピングを収集
      const seen = new Set();
      for (const mapping of this.mappings.values()) {
        if (!seen.has(mapping.id)) {
          seen.add(mapping.id);
          mappings.push(mapping);
        }
      }
      
      await fs.writeFile(this.mappingPath, JSON.stringify(mappings, null, 2));
      logger.debug('Mappings saved', { count: mappings.length });
    } catch (error) {
      logger.error('Failed to save mappings', { error: error.message });
    }
  }

  /**
   * LINEユーザーIDまたはグループIDからチャンネルを取得（存在しない場合は作成）
   * @param {string} lineUserId - LINEユーザーIDまたはグループID
   * @returns {Promise<Object>} チャンネル情報
   */
  async getOrCreateChannel(lineUserId) {
    if (!this.isInitialized) {
      throw new ChannelManagerError(
        'ChannelManager not initialized',
        ErrorCodes.CHANNEL_MANAGER_NOT_INITIALIZED
      );
    }

    // 既存マッピングを確認
    let mapping = this.mappings.get(lineUserId);
    
    if (mapping) {
      // チャンネルが存在するか確認
      try {
        await this.discord.channels.fetch(mapping.discordChannelId);
        return mapping;
      } catch (error) {
        if (error.code === 10003) {
          logger.info('Channel not found, will create new one', { 
            lineUserId, 
            oldChannelId: mapping.discordChannelId 
          });
          // チャンネルが存在しない場合は新規作成
        } else {
          logger.error('Failed to fetch Discord channel', {
            channelId: mapping.discordChannelId,
            error: error.message
          });
          throw error;
        }
      }
    }

    // 新規チャンネル作成
    return await this.createNewChannel(lineUserId);
  }

  /**
   * DiscordチャンネルIDからLINEユーザーIDを取得
   * @param {string} discordChannelId - DiscordチャンネルID
   * @returns {Promise<string|null>} LINEユーザーID
   */
  async getLineUserId(discordChannelId) {
    if (!this.isInitialized) {
      logger.warn('ChannelManager not initialized, returning null for lineUserId');
      return null;
    }
    
    const mapping = this.mappings.get(discordChannelId);
    return mapping ? mapping.lineUserId : null;
  }

  /**
   * 新しいチャンネルを作成
   * @param {string} lineUserId - LINEユーザーID
   * @returns {Promise<Object>} 作成されたマッピング
   */
  async createNewChannel(lineUserId) {
    if (!this.isInitialized) {
      throw new ChannelManagerError(
        'ChannelManager not initialized',
        ErrorCodes.CHANNEL_MANAGER_NOT_INITIALIZED
      );
    }
    try {
      // ギルドを取得
      const guild = this.discord.guilds.cache.first();
      if (!guild) {
        throw new ChannelManagerError(
          'No guild available for channel creation',
          ErrorCodes.NO_GUILD_AVAILABLE
        );
      }
      // Botの権限を確認
      const botMember = guild.members.cache.get(this.discord.user.id);
      if (!botMember || !botMember.permissions.has('ManageChannels')) {
        throw new ChannelManagerError(
          'Bot does not have permission to create channels',
          ErrorCodes.INSUFFICIENT_PERMISSIONS
        );
      }
      // --- ここから追加: LINE名取得 ---
      let rawName = null;
      let isGroup = lineUserId.startsWith('C') || lineUserId.startsWith('G');
      try {
        if (isGroup) {
          const group = await this.lineService.getGroupSummary(lineUserId);
          rawName = group.groupName;
        } else {
          const profile = await this.lineService.getUserProfile(lineUserId);
          rawName = profile.displayName;
        }
      } catch (e) {
        rawName = null;
      }
      // チャンネル名を整形（英数字・ハイフンのみ、32文字以内）
      function toDiscordChannelName(name, fallback) {
        if (!name) return fallback;
        // 日本語・記号を除去し、英小文字・数字・ハイフンのみ
        let ascii = name.normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').toLowerCase();
        ascii = ascii.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        if (!ascii) ascii = fallback;
        return ascii.slice(0, 32);
      }
      const fallback = isGroup ? `line-group-${Date.now()}` : `line-user-${Date.now()}`;
      const channelName = toDiscordChannelName(rawName, fallback);
      // --- ここまで追加 ---
      // テキストチャンネルを作成
      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // テキストチャンネル
        reason: 'LINE-Discord Bridge channel creation'
      });

      // 新しいマッピングを作成
      const newMapping = {
        id: `mapping_${Date.now()}`,
        lineUserId: lineUserId,
        lineUserType: isGroup ? 'group' : 'user',
        discordChannelId: channel.id,
        discordChannelName: channel.name,
        discordGuildName: guild.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // メモリ内キャッシュに追加
      this.mappings.set(lineUserId, newMapping);
      this.mappings.set(channel.id, newMapping);

      // ファイルに保存
      await this.saveMappings();

      logger.info('Created new channel and mapping', {
        lineUserId,
        channelId: channel.id,
        channelName: channel.name,
        mappingId: newMapping.id
      });

      return newMapping;
    } catch (error) {
      logger.error('Failed to create new channel', {
        lineUserId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * チャンネルIDを更新（チャンネルが削除された場合）
   * @param {string} oldChannelId - 古いチャンネルID
   * @param {string} newChannelId - 新しいチャンネルID
   */
  async updateChannelId(oldChannelId, newChannelId) {
    const mapping = this.mappings.get(oldChannelId);
    if (!mapping) {
      logger.warn('No mapping found to update', { oldChannelId, newChannelId });
      return;
    }

    // マッピングを更新
    mapping.discordChannelId = newChannelId;
    mapping.updatedAt = new Date().toISOString();

    // キャッシュを更新
    this.mappings.delete(oldChannelId);
    this.mappings.set(newChannelId, mapping);

    // ファイルに保存
    await this.saveMappings();

    logger.info('Updated channel ID in mapping', {
      oldChannelId,
      newChannelId,
      mappingId: mapping.id
    });
  }

  /**
   * 全マッピングを取得
   * @returns {Array} マッピング一覧
   */
  getAllMappings() {
    const mappings = [];
    const seen = new Set();
    
    for (const mapping of this.mappings.values()) {
      if (!seen.has(mapping.id)) {
        seen.add(mapping.id);
        mappings.push(mapping);
      }
    }
    
    return mappings;
  }

  /**
   * ChannelManagerを停止
   */
  async stop() {
    try {
      logger.info('Stopping ChannelManager');
      this.mappings.clear();
      this.isInitialized = false;
      logger.info('ChannelManager stopped successfully');
    } catch (error) {
      logger.error('Failed to stop ChannelManager', {
        error: error.message
      });
    }
  }
}

module.exports = ChannelManager; 