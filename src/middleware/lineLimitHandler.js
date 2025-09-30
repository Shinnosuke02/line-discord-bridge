/**
 * LINE API月間制限ハンドラー
 * 無料プランでの月間200メッセージ制限に対応
 */
const logger = require('../utils/logger');

class LineLimitHandler {
  constructor() {
    this.monthlyMessageCount = 0;
    this.lastResetDate = new Date().getMonth();
    this.maxMonthlyMessages = 190; // 安全マージンを持って190メッセージ/月に制限
    this.isLimitReached = false;
  }

  /**
   * 月間メッセージ数をリセット
   */
  resetMonthlyCount() {
    const currentMonth = new Date().getMonth();
    if (currentMonth !== this.lastResetDate) {
      this.monthlyMessageCount = 0;
      this.lastResetDate = currentMonth;
      this.isLimitReached = false;
      logger.info('Monthly LINE message count reset', { 
        month: currentMonth + 1,
        count: this.monthlyMessageCount 
      });
    }
  }

  /**
   * メッセージ送信が可能かチェック
   * @returns {boolean} 送信可能かどうか
   */
  canSendMessage() {
    this.resetMonthlyCount();
    
    if (this.isLimitReached) {
      return false;
    }
    
    return this.monthlyMessageCount < this.maxMonthlyMessages;
  }

  /**
   * メッセージ送信を記録
   */
  recordMessageSent() {
    this.monthlyMessageCount++;
    
    if (this.monthlyMessageCount >= this.maxMonthlyMessages) {
      this.isLimitReached = true;
      logger.warn('LINE API monthly limit reached', {
        count: this.monthlyMessageCount,
        limit: this.maxMonthlyMessages
      });
    }
    
    logger.debug('LINE message sent, monthly count updated', {
      count: this.monthlyMessageCount,
      remaining: this.maxMonthlyMessages - this.monthlyMessageCount,
      limitReached: this.isLimitReached
    });
  }

  /**
   * 残りメッセージ数を取得
   * @returns {number} 残りメッセージ数
   */
  getRemainingMessages() {
    this.resetMonthlyCount();
    return Math.max(0, this.maxMonthlyMessages - this.monthlyMessageCount);
  }

  /**
   * メッセージの重要度を判定
   * @param {Object} message - メッセージ
   * @returns {boolean} 重要かどうか
   */
  isImportantMessage(message) {
    // メディアメッセージは重要
    const importantTypes = ['image', 'video', 'audio', 'file', 'location'];
    if (importantTypes.includes(message.type)) {
      return true;
    }
    
    // テキストメッセージで緊急キーワードを含む場合は重要
    if (message.type === 'text') {
      const text = message.text.toLowerCase();
      const urgentKeywords = ['緊急', 'urgent', 'help', '助けて', 'エラー', 'error', '重要'];
      return urgentKeywords.some(keyword => text.includes(keyword));
    }
    
    return false;
  }

  /**
   * メッセージ送信を制限するかどうかを判定
   * @param {Object} message - メッセージ
   * @returns {Object} 制限判定結果
   */
  shouldLimitMessage(message) {
    this.resetMonthlyCount();
    
    // 制限に達していない場合は送信可能
    if (this.canSendMessage()) {
      return { allowed: true, reason: null };
    }
    
    // 制限に達している場合、重要メッセージのみ許可
    if (this.isImportantMessage(message)) {
      return { 
        allowed: true, 
        reason: 'Important message allowed despite limit' 
      };
    }
    
    return { 
      allowed: false, 
      reason: 'Monthly limit reached, non-important message blocked' 
    };
  }

  /**
   * 制限状況を取得
   * @returns {Object} 制限状況
   */
  getLimitStatus() {
    this.resetMonthlyCount();
    
    return {
      monthlyCount: this.monthlyMessageCount,
      maxMonthlyMessages: this.maxMonthlyMessages,
      remainingMessages: this.getRemainingMessages(),
      isLimitReached: this.isLimitReached,
      resetDate: new Date(new Date().getFullYear(), this.lastResetDate + 1, 1),
      usagePercentage: Math.round((this.monthlyMessageCount / this.maxMonthlyMessages) * 100)
    };
  }
}

// シングルトンインスタンス
const lineLimitHandler = new LineLimitHandler();

module.exports = lineLimitHandler;
