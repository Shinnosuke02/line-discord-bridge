/**
 * メッセージ最適化ユーティリティ
 * LINE APIの月間制限を考慮したメッセージ送信の最適化
 */
const logger = require('./logger');

class MessageOptimizer {
  constructor() {
    this.monthlyMessageCount = 0;
    this.lastResetDate = new Date().getMonth();
    this.maxMonthlyMessages = 180; // 安全マージンを持って180メッセージ/月に制限
  }

  /**
   * 月間メッセージ数をリセット
   */
  resetMonthlyCount() {
    const currentMonth = new Date().getMonth();
    if (currentMonth !== this.lastResetDate) {
      this.monthlyMessageCount = 0;
      this.lastResetDate = currentMonth;
      logger.info('Monthly message count reset', { 
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
    return this.monthlyMessageCount < this.maxMonthlyMessages;
  }

  /**
   * メッセージ送信を記録
   */
  recordMessageSent() {
    this.monthlyMessageCount++;
    logger.debug('Message sent, monthly count updated', {
      count: this.monthlyMessageCount,
      remaining: this.maxMonthlyMessages - this.monthlyMessageCount
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
   * メッセージを統合（複数のメッセージを1つにまとめる）
   * @param {Array} messages - 統合するメッセージ配列
   * @returns {Object} 統合されたメッセージ
   */
  mergeMessages(messages) {
    if (messages.length <= 1) {
      return messages[0];
    }

    // テキストメッセージを統合
    const textMessages = messages.filter(msg => msg.type === 'text');
    const otherMessages = messages.filter(msg => msg.type !== 'text');

    if (textMessages.length > 1) {
      const mergedText = textMessages.map(msg => msg.text).join('\n');
      const mergedMessage = {
        type: 'text',
        text: mergedText
      };
      return [mergedMessage, ...otherMessages];
    }

    return messages;
  }

  /**
   * 重要なメッセージかどうかを判定
   * @param {Object} message - メッセージオブジェクト
   * @returns {boolean} 重要かどうか
   */
  isImportantMessage(message) {
    // 画像、動画、音声、ファイル、位置情報は重要
    const importantTypes = ['image', 'video', 'audio', 'file', 'location'];
    return importantTypes.includes(message.type);
  }

  /**
   * メッセージ送信の優先度を決定
   * @param {Object} message - メッセージオブジェクト
   * @returns {number} 優先度（1-5、5が最高優先度）
   */
  getMessagePriority(message) {
    if (this.isImportantMessage(message)) {
      return 5; // 最重要
    }
    
    if (message.type === 'text') {
      const text = message.text.toLowerCase();
      // 緊急キーワードを含むメッセージは高優先度
      const urgentKeywords = ['緊急', 'urgent', 'help', '助けて', 'エラー', 'error'];
      if (urgentKeywords.some(keyword => text.includes(keyword))) {
        return 4; // 高優先度
      }
      return 2; // 通常優先度
    }
    
    return 3; // 中優先度
  }
}

module.exports = MessageOptimizer;
