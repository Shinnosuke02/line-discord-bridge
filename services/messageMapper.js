/**
 * メッセージIDマッピング管理サービス
 * LINEとDiscordのメッセージIDを相互に関連付け、リプライ機能を支援
 */
const logger = require('../utils/logger');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class MessageMapper {
  constructor() {
    this.mappings = new Map(); // メモリ内キャッシュ
    this.filePath = config.files.messageMappings || path.join(__dirname, '../data/message-mappings.json');
    this.maxMappings = config.reply.maxMappings || 10000; // メモリ使用量制限
    this.initialized = false;
  }

  /**
   * 初期化処理
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadMappings();
      this.initialized = true;
      logger.info('MessageMapper initialized', { 
        mappingCount: this.mappings.size 
      });
    } catch (error) {
      logger.error('Failed to initialize MessageMapper', error);
      this.initialized = true; // エラーでも初期化完了とする
    }
  }

  /**
   * ファイルからマッピングを読み込み
   */
  async loadMappings() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const mappingsArray = JSON.parse(data);
      
      // 配列からMapに変換
      this.mappings = new Map(mappingsArray);
      
      logger.debug('Message mappings loaded from file', {
        count: this.mappings.size,
        filePath: this.filePath
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // ファイルが存在しない場合は新規作成
        this.mappings = new Map();
        await this.saveMappings();
        logger.info('Created new message mappings file', {
          filePath: this.filePath
        });
      } else {
        logger.error('Failed to load message mappings', error);
        this.mappings = new Map();
      }
    }
  }

  /**
   * マッピングをファイルに保存
   */
  async saveMappings() {
    try {
      // Mapを配列に変換してJSONで保存
      const mappingsArray = Array.from(this.mappings.entries());
      const data = JSON.stringify(mappingsArray, null, 2);
      
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, data, 'utf8');
      
      logger.debug('Message mappings saved to file', {
        count: this.mappings.size,
        filePath: this.filePath
      });
    } catch (error) {
      logger.error('Failed to save message mappings', error);
    }
  }

  /**
   * メッセージマッピングを追加
   * @param {string|null} lineMessageId - LINEメッセージID（nullの場合は後で設定）
   * @param {string} discordMessageId - DiscordメッセージID
   * @param {string} channelId - Discord チャンネルID
   * @param {string} userId - LINE ユーザーID
   */
  async addMapping(lineMessageId, discordMessageId, channelId, userId) {
    if (!this.initialized) {
      await this.initialize();
    }

    // LINEメッセージIDがある場合のマッピング
    if (lineMessageId) {
      const mappingKey = `line:${lineMessageId}`;
      const mappingValue = {
        discordMessageId,
        channelId,
        userId,
        timestamp: Date.now(),
        platform: 'line'
      };
      this.mappings.set(mappingKey, mappingValue);
    }

    // 逆方向のマッピングも追加（Discordメッセージは必須）
    const reverseMappingKey = `discord:${discordMessageId}`;
    const reverseMappingValue = {
      lineMessageId,
      channelId,
      userId,
      timestamp: Date.now(),
      platform: 'discord'
    };
    this.mappings.set(reverseMappingKey, reverseMappingValue);

    // メモリ使用量制限
    await this.cleanupOldMappings();

    // 非同期でファイルに保存（エラーは無視）
    this.saveMappings().catch(error => {
      logger.warn('Failed to save mappings after add', error);
    });

    logger.debug('Message mapping added', {
      lineMessageId: lineMessageId || 'pending',
      discordMessageId,
      channelId,
      userId
    });
  }

  /**
   * LINEメッセージIDからDiscordメッセージ情報を取得
   * @param {string} lineMessageId - LINEメッセージID
   * @returns {Object|null} Discord メッセージ情報
   */
  getDiscordMessage(lineMessageId) {
    if (!this.initialized) {
      logger.warn('MessageMapper not initialized');
      return null;
    }

    const mappingKey = `line:${lineMessageId}`;
    const mapping = this.mappings.get(mappingKey);
    
    if (mapping) {
      logger.debug('Found Discord message mapping', {
        lineMessageId,
        discordMessageId: mapping.discordMessageId,
        channelId: mapping.channelId
      });
    }

    return mapping || null;
  }

  /**
   * DiscordメッセージIDからLINEメッセージ情報を取得
   * @param {string} discordMessageId - DiscordメッセージID
   * @returns {Object|null} LINE メッセージ情報
   */
  getLineMessage(discordMessageId) {
    if (!this.initialized) {
      logger.warn('MessageMapper not initialized');
      return null;
    }

    const mappingKey = `discord:${discordMessageId}`;
    const mapping = this.mappings.get(mappingKey);
    
    if (mapping) {
      logger.debug('Found LINE message mapping', {
        discordMessageId,
        lineMessageId: mapping.lineMessageId,
        userId: mapping.userId
      });
    }

    return mapping || null;
  }

  /**
   * 古いマッピングをクリーンアップ
   */
  async cleanupOldMappings() {
    if (this.mappings.size <= this.maxMappings) {
      return;
    }

    // タイムスタンプ順にソート
    const sortedEntries = Array.from(this.mappings.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 古いエントリを削除（半分まで削減）
    const deleteCount = Math.floor(this.mappings.size / 2);
    for (let i = 0; i < deleteCount; i++) {
      this.mappings.delete(sortedEntries[i][0]);
    }

    logger.info('Cleaned up old message mappings', {
      deletedCount: deleteCount,
      remainingCount: this.mappings.size
    });
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      totalMappings: this.mappings.size,
      initialized: this.initialized,
      maxMappings: this.maxMappings
    };
  }

  /**
   * 特定のチャンネルのマッピングを取得
   * @param {string} channelId - チャンネルID
   * @returns {Array} マッピング配列
   */
  getMappingsByChannel(channelId) {
    if (!this.initialized) {
      return [];
    }

    const channelMappings = [];
    for (const [key, value] of this.mappings.entries()) {
      if (value.channelId === channelId) {
        channelMappings.push({ key, ...value });
      }
    }

    return channelMappings;
  }

  /**
   * 特定のユーザーのマッピングを取得
   * @param {string} userId - ユーザーID
   * @returns {Array} マッピング配列
   */
  getMappingsByUser(userId) {
    if (!this.initialized) {
      return [];
    }

    const userMappings = [];
    for (const [key, value] of this.mappings.entries()) {
      if (value.userId === userId) {
        userMappings.push({ key, ...value });
      }
    }

    return userMappings;
  }
}

module.exports = MessageMapper;