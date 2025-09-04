/**
 * リプライ機能管理モジュール
 * DiscordとLINEのメッセージIDをマッピングしてリプライ機能を提供
 */
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class ReplyManager {
  constructor() {
    this.messageMap = new Map(); // メッセージIDマッピング
    this.replyMap = new Map(); // リプライ関係マッピング
    this.dataFile = path.join(__dirname, '../data/message-mappings.json');
    this.replyDataFile = path.join(__dirname, '../data/reply-mappings.json');
    this.maxMapSize = 10000; // 最大マッピング数
  }

  /**
   * 初期化
   */
  async initialize() {
    try {
      await this.loadMessageMappings();
      await this.loadReplyMappings();
      logger.info('ReplyManager initialized successfully', {
        messageMapSize: this.messageMap.size,
        replyMapSize: this.replyMap.size
      });
    } catch (error) {
      logger.error('Failed to initialize ReplyManager', error);
      // 初期化に失敗してもアプリは継続動作
    }
  }

  /**
   * メッセージマッピングを保存
   */
  async saveMessageMappings() {
    try {
      const data = Array.from(this.messageMap.entries());
      await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
      logger.debug('Message mappings saved', { count: data.length });
    } catch (error) {
      logger.error('Failed to save message mappings', error);
    }
  }

  /**
   * メッセージマッピングを読み込み
   */
  async loadMessageMappings() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      const entries = JSON.parse(data);
      this.messageMap = new Map(entries);
      logger.debug('Message mappings loaded', { count: entries.length });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load message mappings', error);
      }
      // ファイルが存在しない場合は空のMapで開始
      this.messageMap = new Map();
    }
  }

  /**
   * リプライマッピングを保存
   */
  async saveReplyMappings() {
    try {
      const data = Array.from(this.replyMap.entries());
      await fs.writeFile(this.replyDataFile, JSON.stringify(data, null, 2));
      logger.debug('Reply mappings saved', { count: data.length });
    } catch (error) {
      logger.error('Failed to save reply mappings', error);
    }
  }

  /**
   * リプライマッピングを読み込み
   */
  async loadReplyMappings() {
    try {
      const data = await fs.readFile(this.replyDataFile, 'utf8');
      const entries = JSON.parse(data);
      this.replyMap = new Map(entries);
      logger.debug('Reply mappings loaded', { count: entries.length });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load reply mappings', error);
      }
      // ファイルが存在しない場合は空のMapで開始
      this.replyMap = new Map();
    }
  }

  /**
   * メッセージマッピングを追加
   * @param {string} discordMessageId - DiscordメッセージID
   * @param {string} lineMessageId - LINEメッセージID
   * @param {string} channelId - DiscordチャンネルID
   * @param {string} userId - LINEユーザーID
   */
  addMessageMapping(discordMessageId, lineMessageId, channelId, userId) {
    try {
      const mapping = {
        discordMessageId,
        lineMessageId,
        channelId,
        userId,
        timestamp: Date.now()
      };

      this.messageMap.set(discordMessageId, mapping);
      this.messageMap.set(lineMessageId, mapping);

      // マップサイズ制限
      if (this.messageMap.size > this.maxMapSize) {
        this.cleanupOldMappings();
      }

      // 非同期で保存（エラーが発生しても処理は継続）
      this.saveMessageMappings().catch(err => 
        logger.error('Failed to save message mappings in background', err)
      );

      logger.debug('Message mapping added', {
        discordMessageId,
        lineMessageId,
        channelId,
        userId
      });
    } catch (error) {
      logger.error('Failed to add message mapping', error);
    }
  }

  /**
   * リプライ関係を追加
   * @param {string} replyMessageId - リプライメッセージID
   * @param {string} originalMessageId - 元のメッセージID
   * @param {string} platform - 'discord' または 'line'
   */
  addReplyMapping(replyMessageId, originalMessageId, platform) {
    try {
      const replyData = {
        replyMessageId,
        originalMessageId,
        platform,
        timestamp: Date.now()
      };

      this.replyMap.set(replyMessageId, replyData);

      // 非同期で保存
      this.saveReplyMappings().catch(err => 
        logger.error('Failed to save reply mappings in background', err)
      );

      logger.debug('Reply mapping added', {
        replyMessageId,
        originalMessageId,
        platform
      });
    } catch (error) {
      logger.error('Failed to add reply mapping', error);
    }
  }

  /**
   * メッセージマッピングを取得
   * @param {string} messageId - メッセージID
   * @returns {Object|null} マッピング情報
   */
  getMessageMapping(messageId) {
    return this.messageMap.get(messageId) || null;
  }

  /**
   * リプライ関係を取得
   * @param {string} replyMessageId - リプライメッセージID
   * @returns {Object|null} リプライ情報
   */
  getReplyMapping(replyMessageId) {
    return this.replyMap.get(replyMessageId) || null;
  }

  /**
   * DiscordメッセージIDからLINEメッセージIDを取得
   * @param {string} discordMessageId - DiscordメッセージID
   * @returns {string|null} LINEメッセージID
   */
  getLineMessageId(discordMessageId) {
    const mapping = this.getMessageMapping(discordMessageId);
    return mapping ? mapping.lineMessageId : null;
  }

  /**
   * LINEメッセージIDからDiscordメッセージIDを取得
   * @param {string} lineMessageId - LINEメッセージID
   * @returns {string|null} DiscordメッセージID
   */
  getDiscordMessageId(lineMessageId) {
    const mapping = this.getMessageMapping(lineMessageId);
    return mapping ? mapping.discordMessageId : null;
  }

  /**
   * 古いマッピングをクリーンアップ
   */
  cleanupOldMappings() {
    try {
      const entries = Array.from(this.messageMap.entries());
      const sortedEntries = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const keepCount = Math.floor(this.maxMapSize * 0.8); // 80%を保持
      
      this.messageMap.clear();
      for (let i = 0; i < keepCount && i < sortedEntries.length; i++) {
        this.messageMap.set(sortedEntries[i][0], sortedEntries[i][1]);
      }

      logger.info('Message mappings cleaned up', {
        originalCount: entries.length,
        keptCount: this.messageMap.size
      });
    } catch (error) {
      logger.error('Failed to cleanup old mappings', error);
    }
  }

  /**
   * リプライ機能が有効かチェック
   * @returns {boolean} リプライ機能が有効かどうか
   */
  isReplyEnabled() {
    return true; // 常に有効（エラー時は個別処理でフォールバック）
  }
}

module.exports = ReplyManager;
