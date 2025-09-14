/**
 * 安全な返信サービス
 * リプライ処理が失敗しても通常のメッセージ転送に影響しない設計
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const logger = require('../utils/logger');
const EnhancedReplyService = require('./EnhancedReplyService');

/**
 * 安全な返信サービスクラス
 */
class SafeReplyService extends EnhancedReplyService {
  constructor(messageMappingManager, lineService, discordClient) {
    super(messageMappingManager, lineService, discordClient);
    
    // 安全モード設定
    this.safeMode = true;
    this.maxRetries = 3;
    this.timeoutMs = 5000;
  }

  /**
   * Discord返信を安全に処理
   * @param {Object} message - Discordメッセージ
   * @param {string} lineUserId - LINEユーザーID
   */
  async handleDiscordReply(message, lineUserId) {
    try {
      // タイムアウト付きでリプライ処理を実行
      await this.withTimeout(
        () => super.handleDiscordReply(message, lineUserId),
        this.timeoutMs
      );
      
      logger.debug('Discord reply processed successfully', {
        messageId: message.id
      });
      
    } catch (error) {
      // リプライ処理が失敗しても通常のメッセージ転送は継続
      logger.warn('Discord reply processing failed, but normal message flow continues', {
        messageId: message.id,
        error: error.message,
        safeMode: this.safeMode
      });
      
      this.replyStats.failed++;
      
      // 安全モードでは例外を再スローしない
      if (!this.safeMode) {
        throw error;
      }
    }
  }

  /**
   * LINE返信を安全に処理
   * @param {Object} event - LINEイベント
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async handleLineReply(event, discordChannelId) {
    try {
      // タイムアウト付きでリプライ処理を実行
      await this.withTimeout(
        () => super.handleLineReply(event, discordChannelId),
        this.timeoutMs
      );
      
      logger.debug('LINE reply processed successfully', {
        eventId: event.message?.id
      });
      
    } catch (error) {
      // リプライ処理が失敗しても通常のメッセージ転送は継続
      logger.warn('LINE reply processing failed, but normal message flow continues', {
        eventId: event.message?.id,
        error: error.message,
        safeMode: this.safeMode
      });
      
      this.replyStats.failed++;
      
      // 安全モードでは例外を再スローしない
      if (!this.safeMode) {
        throw error;
      }
    }
  }

  /**
   * タイムアウト付きで関数を実行
   * @param {Function} fn - 実行する関数
   * @param {number} timeoutMs - タイムアウト時間（ミリ秒）
   * @returns {Promise} 実行結果
   */
  async withTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Reply processing timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 安全モードの設定
   * @param {boolean} enabled - 安全モードを有効にするかどうか
   */
  setSafeMode(enabled) {
    this.safeMode = enabled;
    logger.info('Safe mode updated', { safeMode: this.safeMode });
  }

  /**
   * タイムアウト設定
   * @param {number} timeoutMs - タイムアウト時間（ミリ秒）
   */
  setTimeout(timeoutMs) {
    this.timeoutMs = timeoutMs;
    logger.info('Reply timeout updated', { timeoutMs });
  }

  /**
   * リプライ機能の健全性チェック
   * @returns {Object} 健全性チェック結果
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    return {
      ...baseHealth,
      safeMode: this.safeMode,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      safetyFeatures: {
        timeoutProtection: true,
        errorIsolation: true,
        gracefulDegradation: true
      }
    };
  }

  /**
   * 安全統計を取得
   * @returns {Object} 安全統計
   */
  getSafetyStats() {
    const baseStats = this.getReplyStats();
    
    return {
      ...baseStats,
      safetyMode: this.safeMode,
      timeoutMs: this.timeoutMs,
      errorRate: baseStats.failed / Math.max(1, baseStats.totalReplies + baseStats.failed),
      reliability: baseStats.totalReplies / Math.max(1, baseStats.totalReplies + baseStats.failed)
    };
  }
}

module.exports = SafeReplyService;
