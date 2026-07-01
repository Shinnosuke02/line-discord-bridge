/**
 * LINE API使用量監視サービス
 * 月間メッセージ数の監視とアラート機能
 */
const logger = require('../utils/logger');
const lineLimitHandler = require('../middleware/lineLimitHandler');

class LineUsageMonitor {
  constructor() {
    this.alertThresholds = {
      warning: 30,    // 30メッセージ以下で警告
      critical: 10,   // 10メッセージ以下で重要警告
      emergency: 5    // 5メッセージ以下で緊急警告
    };
    this.alertedLevels = new Set(); // 既にアラートを送信したレベル
    this.lastAlertTime = 0;
    this.alertCooldown = 24 * 60 * 60 * 1000; // 24時間のクールダウン
    this.monitoringInterval = null;
  }

  /**
   * LINE APIの使用量統計を取得（LINE APIから直接取得はできないため、内部カウンターを使用）
   * @returns {Object} 使用量統計
   */
  async getUsageStatistics() {
    const limitStatus = lineLimitHandler.getLimitStatus();
    
    return {
      monthlyCount: limitStatus.monthlyCount,
      maxMonthlyMessages: limitStatus.maxMonthlyMessages,
      remainingMessages: limitStatus.remainingMessages,
      usagePercentage: limitStatus.usagePercentage,
      isLimitReached: limitStatus.isLimitReached,
      resetDate: limitStatus.resetDate
    };
  }

  /**
   * 使用量をチェックし、必要に応じてアラートを送信
   * @param {Function} alertCallback - アラート送信コールバック
   */
  async checkUsageAndAlert(alertCallback) {
    try {
      const stats = await this.getUsageStatistics();
      const remaining = stats.remainingMessages;

      // クールダウンチェック
      const now = Date.now();
      if (now - this.lastAlertTime < this.alertCooldown) {
        return;
      }

      // アラートレベルの判定
      let alertLevel = null;
      let message = '';

      if (remaining <= this.alertThresholds.emergency) {
        alertLevel = 'emergency';
        message = `🚨 緊急: LINE API残りメッセージ数が${remaining}件になりました！`;
      } else if (remaining <= this.alertThresholds.critical && !this.alertedLevels.has('critical')) {
        alertLevel = 'critical';
        message = `⚠️ 重要: LINE API残りメッセージ数が${remaining}件になりました。`;
      } else if (remaining <= this.alertThresholds.warning && !this.alertedLevels.has('warning')) {
        alertLevel = 'warning';
        message = `⚠️ 警告: LINE API残りメッセージ数が${remaining}件になりました。`;
      }

      // アラート送信
      if (alertLevel && alertCallback) {
        await this.sendAlert(alertLevel, message, stats, alertCallback);
        this.alertedLevels.add(alertLevel);
        this.lastAlertTime = now;
      }

      // リセット時にアラートレベルをクリア
      if (remaining > this.alertThresholds.warning) {
        this.alertedLevels.clear();
      }

      logger.debug('LINE usage checked', {
        remaining,
        alertLevel,
        alertedLevels: Array.from(this.alertedLevels)
      });

    } catch (error) {
      logger.error('Failed to check LINE usage', {
        error: error.message
      });
    }
  }

  /**
   * アラートを送信
   * @param {string} level - アラートレベル
   * @param {string} message - アラートメッセージ
   * @param {Object} stats - 使用量統計
   * @param {Function} alertCallback - アラート送信コールバック
   */
  async sendAlert(level, message, stats, alertCallback) {
    try {
      const alertMessage = {
        type: 'text',
        text: `${message}

📊 使用量詳細:
• 月間使用数: ${stats.monthlyCount}/${stats.maxMonthlyMessages}
• 残りメッセージ: ${stats.remainingMessages}件
• 使用率: ${stats.usagePercentage}%
• リセット日: ${stats.resetDate.toLocaleDateString('ja-JP')}

${level === 'emergency' ? '🚨 すぐにLINEプランのアップグレードを検討してください！' :
    level === 'critical' ? '⚠️ 近日中にLINEプランのアップグレードを検討してください。' :
      '📝 使用量を監視し、必要に応じてプラン変更を検討してください。'}`
      };

      // アラートを送信
      await alertCallback(alertMessage);

      logger.info('LINE usage alert sent', {
        level,
        remainingMessages: stats.remainingMessages,
        usagePercentage: stats.usagePercentage
      });

    } catch (error) {
      logger.error('Failed to send LINE usage alert', {
        level,
        error: error.message
      });
    }
  }

  /**
   * 定期的な監視を開始
   * @param {Function} alertCallback - アラート送信コールバック
   * @param {number} intervalMinutes - チェック間隔（分）
   */
  startMonitoring(alertCallback, intervalMinutes = 60) {
    this.stopMonitoring();

    logger.info('LINE usage monitoring started', {
      intervalMinutes,
      thresholds: this.alertThresholds
    });

    // 初回チェック
    this.checkUsageAndAlert(alertCallback);

    // 定期的なチェック
    this.monitoringInterval = setInterval(() => {
      this.checkUsageAndAlert(alertCallback);
    }, intervalMinutes * 60 * 1000);
    this.monitoringInterval.unref?.();
  }

  /**
   * 監視を停止
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('LINE usage monitoring stopped');
  }

  /**
   * アラート設定を更新
   * @param {Object} newThresholds - 新しい閾値設定
   */
  updateAlertThresholds(newThresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
    this.alertedLevels.clear(); // 新しい設定でアラートレベルをリセット
    
    logger.info('LINE usage alert thresholds updated', {
      newThresholds: this.alertThresholds
    });
  }

  /**
   * 監視状況を取得
   * @returns {Object} 監視状況
   */
  getMonitoringStatus() {
    return {
      thresholds: this.alertThresholds,
      alertedLevels: Array.from(this.alertedLevels),
      lastAlertTime: this.lastAlertTime,
      cooldownRemaining: Math.max(0, this.alertCooldown - (Date.now() - this.lastAlertTime)),
      isMonitoring: !!this.monitoringInterval
    };
  }
}

module.exports = LineUsageMonitor;
