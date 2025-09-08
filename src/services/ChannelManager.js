/**
 * チャンネル管理サービス
 * LINEとDiscordのチャンネルマッピングを管理
 */
const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * チャンネル管理クラス
 */
class ChannelManager {
  constructor(discordClient, lineService) {
    this.discord = discordClient;
    this.lineService = lineService;
    this.mappings = new Map();
    this.mappingFile = path.join(process.cwd(), 'data', 'channel-mappings.json');
    this.isInitialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    try {
      await this.loadMappings();
      this.isInitialized = true;
      logger.info('ChannelManager initialized', {
        mappingCount: this.mappings.size
      });
    } catch (error) {
      logger.error('Failed to initialize ChannelManager', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * マッピングを読み込み
   */
  async loadMappings() {
    try {
      const data = await fs.readFile(this.mappingFile, 'utf8');
      const mappings = JSON.parse(data);
      
      this.mappings.clear();
      for (const [key, value] of Object.entries(mappings)) {
        this.mappings.set(key, value);
      }
      
      logger.debug('Channel mappings loaded', {
        count: this.mappings.size
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // ファイルが存在しない場合は空のマッピングで開始
        logger.info('Channel mapping file not found, starting with empty mappings');
        this.mappings.clear();
      } else {
        logger.error('Failed to load channel mappings', {
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * マッピングを保存
   */
  async saveMappings() {
    try {
      const mappings = Object.fromEntries(this.mappings);
      await fs.writeFile(this.mappingFile, JSON.stringify(mappings, null, 2));
      
      logger.debug('Channel mappings saved', {
        count: this.mappings.size
      });
    } catch (error) {
      logger.error('Failed to save channel mappings', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * チャンネルマッピングを取得または作成
   * @param {string} sourceId - LINEのソースID（グループIDまたはユーザーID）
   * @returns {Object} チャンネルマッピング
   */
  async getOrCreateChannel(sourceId) {
    try {
      // 既存のマッピングを確認
      let mapping = this.mappings.get(sourceId);
      
      if (mapping) {
        // チャンネルが存在するか確認
        const channelExists = await this.validateChannel(mapping.discordChannelId);
        if (channelExists) {
          return mapping;
        } else {
          // チャンネルが存在しない場合は削除
          this.mappings.delete(sourceId);
          logger.warn('Discord channel no longer exists, removing mapping', {
            sourceId,
            discordChannelId: mapping.discordChannelId
          });
        }
      }

      // 新しいチャンネルを作成
      mapping = await this.createNewChannel(sourceId);
      if (mapping) {
        this.mappings.set(sourceId, mapping);
        await this.saveMappings();
        
        logger.info('New channel mapping created', {
          sourceId,
          discordChannelId: mapping.discordChannelId,
          channelName: mapping.channelName
        });
      }

      return mapping;
    } catch (error) {
      logger.error('Failed to get or create channel', {
        sourceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 新しいチャンネルを作成
   * @param {string} sourceId - LINEのソースID
   * @returns {Object} チャンネルマッピング
   */
  async createNewChannel(sourceId) {
    try {
      const guildId = config.discord.guildId;
      if (!guildId) {
        throw new Error('Discord guild ID not configured');
      }

      const guild = await this.discord.guilds.fetch(guildId);
      if (!guild) {
        throw new Error(`Discord guild not found: ${guildId}`);
      }

      // チャンネル名を生成
      const channelName = await this.generateChannelName(sourceId);
      
      // チャンネルを作成
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: `LINE Bridge Channel for ${sourceId}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      const mapping = {
        sourceId,
        discordChannelId: channel.id,
        channelName: channel.name,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };

      return mapping;
    } catch (error) {
      logger.error('Failed to create new channel', {
        sourceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * チャンネル名を生成
   * @param {string} sourceId - LINEのソースID
   * @returns {string} チャンネル名
   */
  async generateChannelName(sourceId) {
    try {
      // グループの場合はグループ名を取得
      if (sourceId.startsWith('C')) {
        try {
          const groupSummary = await this.lineService.getGroupSummary(sourceId);
          const groupName = groupSummary.groupName || 'Unknown Group';
          return this.sanitizeChannelName(groupName);
        } catch (error) {
          logger.warn('Failed to get group name, using fallback', {
            sourceId,
            error: error.message
          });
        }
      }

      // ユーザーの場合はユーザー名を取得
      if (sourceId.startsWith('U')) {
        try {
          const userProfile = await this.lineService.getUserProfile(sourceId);
          const userName = userProfile.displayName || 'Unknown User';
          return this.sanitizeChannelName(userName);
        } catch (error) {
          logger.warn('Failed to get user name, using fallback', {
            sourceId,
            error: error.message
          });
        }
      }

      // フォールバック
      return sourceId.substring(0, 8);
    } catch (error) {
      logger.error('Failed to generate channel name', {
        sourceId,
        error: error.message
      });
      return `line-${sourceId.substring(0, 8)}`;
    }
  }

  /**
   * チャンネル名をサニタイズ
   * @param {string} name - 元の名前
   * @returns {string} サニタイズされた名前
   */
  sanitizeChannelName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * チャンネルが存在するか確認
   * @param {string} channelId - DiscordチャンネルID
   * @returns {boolean} 存在するかどうか
   */
  async validateChannel(channelId) {
    try {
      const channel = await this.discord.channels.fetch(channelId);
      return !!channel;
    } catch (error) {
      return false;
    }
  }

  /**
   * LINEユーザーIDを取得
   * @param {string} discordChannelId - DiscordチャンネルID
   * @returns {string|null} LINEユーザーID
   */
  async getLineUserId(discordChannelId) {
    try {
      for (const [sourceId, mapping] of this.mappings) {
        if (mapping.discordChannelId === discordChannelId) {
          // 最後に使用された時刻を更新
          mapping.lastUsed = new Date().toISOString();
          await this.saveMappings();
          
          return sourceId;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get LINE user ID', {
        discordChannelId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * チャンネルマッピングを削除
   * @param {string} sourceId - LINEのソースID
   * @returns {boolean} 削除成功
   */
  async removeChannelMapping(sourceId) {
    try {
      const mapping = this.mappings.get(sourceId);
      if (!mapping) {
        return false;
      }

      // Discordチャンネルを削除
      try {
        const channel = await this.discord.channels.fetch(mapping.discordChannelId);
        if (channel) {
          await channel.delete();
          logger.info('Discord channel deleted', {
            channelId: mapping.discordChannelId,
            channelName: mapping.channelName
          });
        }
      } catch (error) {
        logger.warn('Failed to delete Discord channel', {
          channelId: mapping.discordChannelId,
          error: error.message
        });
      }

      // マッピングを削除
      this.mappings.delete(sourceId);
      await this.saveMappings();

      logger.info('Channel mapping removed', {
        sourceId,
        discordChannelId: mapping.discordChannelId
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove channel mapping', {
        sourceId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * すべてのチャンネルマッピングを取得
   * @returns {Array} チャンネルマッピング配列
   */
  getAllMappings() {
    return Array.from(this.mappings.values());
  }

  /**
   * チャンネルマッピングの統計を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    const mappings = Array.from(this.mappings.values());
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentMappings = mappings.filter(m => new Date(m.lastUsed) > oneDayAgo);
    const weeklyMappings = mappings.filter(m => new Date(m.lastUsed) > oneWeekAgo);

    return {
      totalMappings: mappings.length,
      recentMappings: recentMappings.length,
      weeklyMappings: weeklyMappings.length,
      oldestMapping: mappings.length > 0 ? 
        Math.min(...mappings.map(m => new Date(m.createdAt).getTime())) : null,
      newestMapping: mappings.length > 0 ? 
        Math.max(...mappings.map(m => new Date(m.createdAt).getTime())) : null
    };
  }

  /**
   * 古いマッピングをクリーンアップ
   * @param {number} daysOld - 何日以上古いマッピングを削除するか
   * @returns {number} 削除されたマッピング数
   */
  async cleanupOldMappings(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const mappingsToRemove = [];
      for (const [sourceId, mapping] of this.mappings) {
        if (new Date(mapping.lastUsed) < cutoffDate) {
          mappingsToRemove.push(sourceId);
        }
      }

      let removedCount = 0;
      for (const sourceId of mappingsToRemove) {
        const removed = await this.removeChannelMapping(sourceId);
        if (removed) {
          removedCount++;
        }
      }

      logger.info('Old channel mappings cleaned up', {
        removedCount,
        daysOld
      });

      return removedCount;
    } catch (error) {
      logger.error('Failed to cleanup old mappings', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * チャンネル名を更新
   * @param {string} sourceId - ソースID
   * @param {string} newName - 新しいチャンネル名
   * @returns {boolean} 更新成功
   */
  async updateChannelName(sourceId, newName) {
    try {
      const mapping = this.mappings.get(sourceId);
      if (!mapping) {
        logger.warn('Channel mapping not found for update', { sourceId });
        return false;
      }

      const channel = await this.discord.channels.fetch(mapping.discordChannelId);
      if (!channel) {
        logger.warn('Discord channel not found for update', { 
          sourceId, 
          channelId: mapping.discordChannelId 
        });
        return false;
      }

      // チャンネル名を更新
      await channel.setName(newName);
      
      // マッピング情報を更新
      mapping.channelName = newName;
      mapping.updatedAt = new Date().toISOString();
      
      await this.saveMappings();

      logger.info('Channel name updated', {
        sourceId,
        channelId: mapping.discordChannelId,
        oldName: mapping.channelName,
        newName
      });

      return true;
    } catch (error) {
      logger.error('Failed to update channel name', {
        sourceId,
        newName,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 停止処理
   */
  async stop() {
    try {
      await this.saveMappings();
      this.isInitialized = false;
      logger.info('ChannelManager stopped');
    } catch (error) {
      logger.error('Failed to stop ChannelManager', {
        error: error.message
      });
    }
  }
}

module.exports = ChannelManager;
