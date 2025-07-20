/**
 * チャンネルマッピング管理サービス
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class MappingManager {
  constructor() {
    this.mappingsFile = path.join(__dirname, '../data/channel-mappings.json');
    this.mappings = this.loadMappings();
  }

  /**
   * マッピングデータを読み込み
   * @returns {Object} マッピングデータ
   */
  loadMappings() {
    try {
      if (fs.existsSync(this.mappingsFile)) {
        const data = fs.readFileSync(this.mappingsFile, 'utf8');
        const parsed = JSON.parse(data);
        
        // バージョン互換性チェック
        if (!parsed.metadata || !parsed.mappings) {
          logger.warn('Invalid mapping file format, creating new one');
          return this.createDefaultMappings();
        }
        
        logger.info('Channel mappings loaded', { 
          count: parsed.mappings.length,
          version: parsed.metadata.version 
        });
        return parsed;
      } else {
        logger.info('No mapping file found, creating new one');
        return this.createDefaultMappings();
      }
    } catch (error) {
      logger.error('Failed to load channel mappings', error);
      return this.createDefaultMappings();
    }
  }

  /**
   * デフォルトマッピングデータを作成
   * @returns {Object} デフォルトマッピングデータ
   */
  createDefaultMappings() {
    return {
      mappings: [],
      metadata: {
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * マッピングデータを保存
   */
  saveMappings() {
    try {
      this.mappings.metadata.lastUpdated = new Date().toISOString();
      
      // データディレクトリが存在しない場合は作成
      const dataDir = path.dirname(this.mappingsFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(
        this.mappingsFile,
        JSON.stringify(this.mappings, null, 2)
      );
      
      logger.debug('Channel mappings saved', { 
        count: this.mappings.mappings.length 
      });
    } catch (error) {
      logger.error('Failed to save channel mappings', error);
      throw error;
    }
  }

  /**
   * マッピングを追加
   * @param {string} lineChannelId - LINEチャンネルID
   * @param {string} discordChannelId - DiscordチャンネルID
   * @param {string} name - チャンネル名
   * @param {string} type - マッピングタイプ ('user' | 'group')
   * @returns {Object} 作成されたマッピング
   */
  addMapping(lineChannelId, discordChannelId, name, type = 'user') {
    // 既存のマッピングをチェック
    const existingIndex = this.mappings.mappings.findIndex(
      m => m.lineChannelId === lineChannelId || m.discordChannelId === discordChannelId
    );

    const mapping = {
      id: this.generateMappingId(),
      lineChannelId,
      discordChannelId,
      name,
      type,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      // 既存のマッピングを更新
      this.mappings.mappings[existingIndex] = {
        ...this.mappings.mappings[existingIndex],
        ...mapping,
        createdAt: this.mappings.mappings[existingIndex].createdAt // 作成日時は保持
      };
      logger.info('Updated existing mapping', { mappingId: mapping.id });
    } else {
      // 新しいマッピングを追加
      this.mappings.mappings.push(mapping);
      logger.info('Added new mapping', { mappingId: mapping.id });
    }

    this.saveMappings();
    return mapping;
  }

  /**
   * マッピングIDを生成
   * @returns {string} マッピングID
   */
  generateMappingId() {
    return `mapping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * LINEチャンネルIDからDiscordチャンネルIDを取得
   * @param {string} lineChannelId - LINEチャンネルID
   * @returns {string|null} DiscordチャンネルID
   */
  getDiscordChannelId(lineChannelId) {
    const mapping = this.mappings.mappings.find(m => m.lineChannelId === lineChannelId);
    if (mapping) {
      mapping.lastUsed = new Date().toISOString();
      this.saveMappings();
      return mapping.discordChannelId;
    }
    return null;
  }

  /**
   * DiscordチャンネルIDからLINEチャンネルIDを取得
   * @param {string} discordChannelId - DiscordチャンネルID
   * @returns {string|null} LINEチャンネルID
   */
  getLineChannelId(discordChannelId) {
    const mapping = this.mappings.mappings.find(m => m.discordChannelId === discordChannelId);
    if (mapping) {
      mapping.lastUsed = new Date().toISOString();
      this.saveMappings();
      return mapping.lineChannelId;
    }
    return null;
  }

  /**
   * マッピングを削除
   * @param {string} mappingId - マッピングID
   * @returns {boolean} 削除成功かどうか
   */
  removeMapping(mappingId) {
    const index = this.mappings.mappings.findIndex(m => m.id === mappingId);
    if (index >= 0) {
      const removed = this.mappings.mappings.splice(index, 1)[0];
      this.saveMappings();
      logger.info('Removed mapping', { mappingId, name: removed.name });
      return true;
    }
    return false;
  }

  /**
   * すべてのマッピングを取得
   * @returns {Array} マッピング配列
   */
  getAllMappings() {
    return this.mappings.mappings;
  }

  /**
   * マッピングが存在するかチェック
   * @param {string} lineChannelId - LINEチャンネルID
   * @param {string} discordChannelId - DiscordチャンネルID
   * @returns {boolean} マッピングが存在するかどうか
   */
  hasMapping(lineChannelId, discordChannelId) {
    return this.mappings.mappings.some(m => 
      m.lineChannelId === lineChannelId || m.discordChannelId === discordChannelId
    );
  }

  /**
   * マッピング統計を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    const total = this.mappings.mappings.length;
    const userMappings = this.mappings.mappings.filter(m => m.type === 'user').length;
    const groupMappings = this.mappings.mappings.filter(m => m.type === 'group').length;
    
    return {
      total,
      userMappings,
      groupMappings,
      lastUpdated: this.mappings.metadata.lastUpdated
    };
  }

  /**
   * 古いマッピングをクリーンアップ
   * @param {number} daysOld - 何日前のマッピングを削除するか
   * @returns {number} 削除されたマッピング数
   */
  cleanupOldMappings(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const initialCount = this.mappings.mappings.length;
    this.mappings.mappings = this.mappings.mappings.filter(mapping => {
      const lastUsed = new Date(mapping.lastUsed);
      return lastUsed > cutoffDate;
    });
    
    const removedCount = initialCount - this.mappings.mappings.length;
    if (removedCount > 0) {
      this.saveMappings();
      logger.info('Cleaned up old mappings', { removedCount });
    }
    
    return removedCount;
  }
}

module.exports = MappingManager; 