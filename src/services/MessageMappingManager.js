/**
 * メッセージマッピング管理サービス
 * LINEとDiscordのメッセージIDマッピングを管理
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * メッセージマッピング管理クラス
 */
class MessageMappingManager {
  constructor() {
    this.lineToDiscord = new Map();
    this.discordToLine = new Map();
    this.mappingFile = path.join(process.cwd(), 'data', 'message-mappings.json');
    this.isInitialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    try {
      await this.loadMappings();
      this.isInitialized = true;
      logger.info('MessageMappingManager initialized', {
        lineToDiscordCount: this.lineToDiscord.size,
        discordToLineCount: this.discordToLine.size
      });
    } catch (error) {
      logger.error('Failed to initialize MessageMappingManager', {
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
      
      this.lineToDiscord.clear();
      this.discordToLine.clear();
      
      if (mappings.lineToDiscord) {
        for (const [key, value] of Object.entries(mappings.lineToDiscord)) {
          this.lineToDiscord.set(key, value);
        }
      }
      
      if (mappings.discordToLine) {
        for (const [key, value] of Object.entries(mappings.discordToLine)) {
          this.discordToLine.set(key, value);
        }
      }
      
      logger.debug('Message mappings loaded', {
        lineToDiscordCount: this.lineToDiscord.size,
        discordToLineCount: this.discordToLine.size
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // ファイルが存在しない場合は空のマッピングで開始
        logger.info('Message mapping file not found, starting with empty mappings');
        this.lineToDiscord.clear();
        this.discordToLine.clear();
      } else {
        logger.error('Failed to load message mappings', {
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
      const mappings = {
        lineToDiscord: Object.fromEntries(this.lineToDiscord),
        discordToLine: Object.fromEntries(this.discordToLine),
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(this.mappingFile, JSON.stringify(mappings, null, 2));
      
      logger.debug('Message mappings saved', {
        lineToDiscordCount: this.lineToDiscord.size,
        discordToLineCount: this.discordToLine.size
      });
    } catch (error) {
      logger.error('Failed to save message mappings', {
        error: error.message
      });
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
    try {
      const mapping = {
        lineMessageId,
        discordMessageId,
        lineUserId,
        discordChannelId,
        timestamp: new Date().toISOString()
      };
      
      this.lineToDiscord.set(lineMessageId, mapping);
      await this.saveMappings();
      
      logger.debug('LINE to Discord mapping created', {
        lineMessageId,
        discordMessageId,
        lineUserId,
        discordChannelId
      });
    } catch (error) {
      logger.error('Failed to create LINE to Discord mapping', {
        lineMessageId,
        discordMessageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * DiscordメッセージIDをLINEメッセージIDにマッピング
   * @param {string} discordMessageId - DiscordメッセージID
   * @param {string} lineMessageId - LINEメッセージID
   * @param {string} lineUserId - LINEユーザーID
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async mapDiscordToLine(discordMessageId, lineMessageId, lineUserId, discordChannelId) {
    try {
      const mapping = {
        discordMessageId,
        lineMessageId,
        lineUserId,
        discordChannelId,
        timestamp: new Date().toISOString()
      };
      
      this.discordToLine.set(discordMessageId, mapping);
      await this.saveMappings();
      
      logger.debug('Discord to LINE mapping created', {
        discordMessageId,
        lineMessageId,
        lineUserId,
        discordChannelId
      });
    } catch (error) {
      logger.error('Failed to create Discord to LINE mapping', {
        discordMessageId,
        lineMessageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * LINEメッセージIDからDiscordメッセージIDを取得
   * @param {string} lineMessageId - LINEメッセージID
   * @returns {string|null} DiscordメッセージID
   */
  getDiscordMessageIdForLineReply(lineMessageId) {
    const mapping = this.lineToDiscord.get(lineMessageId);
    return mapping ? mapping.discordMessageId : null;
  }

  /**
   * DiscordメッセージIDからLINEメッセージIDを取得
   * @param {string} discordMessageId - DiscordメッセージID
   * @returns {string|null} LINEメッセージID
   */
  getLineMessageIdForDiscordReply(discordMessageId) {
    const mapping = this.discordToLine.get(discordMessageId);
    return mapping ? mapping.lineMessageId : null;
  }

  /**
   * LINEメッセージIDのマッピング情報を取得
   * @param {string} lineMessageId - LINEメッセージID
   * @returns {Object|null} マッピング情報
   */
  getLineToDiscordMapping(lineMessageId) {
    return this.lineToDiscord.get(lineMessageId) || null;
  }

  /**
   * DiscordメッセージIDのマッピング情報を取得
   * @param {string} discordMessageId - DiscordメッセージID
   * @returns {Object|null} マッピング情報
   */
  getDiscordToLineMapping(discordMessageId) {
    return this.discordToLine.get(discordMessageId) || null;
  }

  /**
   * マッピングを削除
   * @param {string} lineMessageId - LINEメッセージID
   * @param {string} discordMessageId - DiscordメッセージID
   */
  async removeMapping(lineMessageId, discordMessageId) {
    try {
      let removed = false;
      
      if (lineMessageId && this.lineToDiscord.has(lineMessageId)) {
        this.lineToDiscord.delete(lineMessageId);
        removed = true;
      }
      
      if (discordMessageId && this.discordToLine.has(discordMessageId)) {
        this.discordToLine.delete(discordMessageId);
        removed = true;
      }
      
      if (removed) {
        await this.saveMappings();
        logger.debug('Message mapping removed', {
          lineMessageId,
          discordMessageId
        });
      }
    } catch (error) {
      logger.error('Failed to remove message mapping', {
        lineMessageId,
        discordMessageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 古いマッピングをクリーンアップ
   * @param {number} daysOld - 何日以上古いマッピングを削除するか
   * @returns {number} 削除されたマッピング数
   */
  async cleanupOldMappings(daysOld = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let removedCount = 0;

      // LINE to Discord マッピングのクリーンアップ
      for (const [lineMessageId, mapping] of this.lineToDiscord) {
        if (new Date(mapping.timestamp) < cutoffDate) {
          this.lineToDiscord.delete(lineMessageId);
          removedCount++;
        }
      }

      // Discord to LINE マッピングのクリーンアップ
      for (const [discordMessageId, mapping] of this.discordToLine) {
        if (new Date(mapping.timestamp) < cutoffDate) {
          this.discordToLine.delete(discordMessageId);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await this.saveMappings();
        logger.info('Old message mappings cleaned up', {
          removedCount,
          daysOld
        });
      }

      return removedCount;
    } catch (error) {
      logger.error('Failed to cleanup old mappings', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * すべてのマッピングを取得
   * @returns {Object} マッピング情報
   */
  getAllMappings() {
    return {
      lineToDiscord: Array.from(this.lineToDiscord.values()),
      discordToLine: Array.from(this.discordToLine.values())
    };
  }

  /**
   * マッピングの統計を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    const lineToDiscordMappings = Array.from(this.lineToDiscord.values());
    const discordToLineMappings = Array.from(this.discordToLine.values());
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentLineToDiscord = lineToDiscordMappings.filter(m => 
      new Date(m.timestamp) > oneDayAgo
    );
    const recentDiscordToLine = discordToLineMappings.filter(m => 
      new Date(m.timestamp) > oneDayAgo
    );

    const weeklyLineToDiscord = lineToDiscordMappings.filter(m => 
      new Date(m.timestamp) > oneWeekAgo
    );
    const weeklyDiscordToLine = discordToLineMappings.filter(m => 
      new Date(m.timestamp) > oneWeekAgo
    );

    return {
      totalMappings: this.lineToDiscord.size + this.discordToLine.size,
      lineToDiscordCount: this.lineToDiscord.size,
      discordToLineCount: this.discordToLine.size,
      recentMappings: recentLineToDiscord.length + recentDiscordToLine.length,
      weeklyMappings: weeklyLineToDiscord.length + weeklyDiscordToLine.length,
      isInitialized: this.isInitialized
    };
  }

  /**
   * 停止処理
   */
  async stop() {
    try {
      await this.saveMappings();
      this.isInitialized = false;
      logger.info('MessageMappingManager stopped');
    } catch (error) {
      logger.error('Failed to stop MessageMappingManager', {
        error: error.message
      });
    }
  }
}

module.exports = MessageMappingManager;
