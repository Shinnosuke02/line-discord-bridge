/**
 * メッセージキューサービス
 * LINE APIの月間制限を考慮したメッセージ送信キュー
 */
const MessageOptimizer = require('../utils/messageOptimizer');
const logger = require('../utils/logger');

class MessageQueue {
  constructor() {
    this.optimizer = new MessageOptimizer();
    this.queue = [];
    this.isProcessing = false;
    this.maxQueueSize = 50; // 最大キューサイズ
  }

  /**
   * メッセージをキューに追加
   * @param {string} userId - LINEユーザーID
   * @param {Object} message - メッセージ
   * @param {number} priority - 優先度（1-5）
   * @returns {boolean} キューに追加されたかどうか
   */
  enqueue(userId, message, priority = 3) {
    // キューサイズ制限チェック
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('Message queue is full, dropping message', {
        userId,
        messageType: message.type,
        queueSize: this.queue.length
      });
      return false;
    }

    const queueItem = {
      userId,
      message,
      priority,
      timestamp: Date.now(),
      retryCount: 0
    };

    // 優先度順でソート
    this.queue.push(queueItem);
    this.queue.sort((a, b) => b.priority - a.priority);

    logger.debug('Message enqueued', {
      userId,
      messageType: message.type,
      priority,
      queueSize: this.queue.length
    });

    // キューの処理を開始
    this.processQueue();
    return true;
  }

  /**
   * キューを処理
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 && this.optimizer.canSendMessage()) {
      const item = this.queue.shift();
      
      try {
        // メッセージ送信を試行
        await this.sendMessage(item.userId, item.message);
        this.optimizer.recordMessageSent();
        
        logger.debug('Message sent from queue', {
          userId: item.userId,
          messageType: item.message.type,
          remaining: this.optimizer.getRemainingMessages()
        });
        
      } catch (error) {
        logger.error('Failed to send message from queue', {
          userId: item.userId,
          messageType: item.message.type,
          error: error.message,
          retryCount: item.retryCount
        });

        // リトライ可能な場合
        if (item.retryCount < 2 && this.shouldRetry(error)) {
          item.retryCount++;
          this.queue.unshift(item); // キューに戻す
        }
      }

      // レート制限を避けるため少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;

    // 残りメッセージがある場合は定期的にチェック
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 60000); // 1分後に再試行
    }
  }

  /**
   * メッセージを送信（実際の送信処理）
   * @param {string} userId - LINEユーザーID
   * @param {Object} message - メッセージ
   */
  async sendMessage(userId, message) {
    // ここで実際のLINE API呼び出しを行う
    // MessageBridgeから注入される
    throw new Error('sendMessage method must be implemented');
  }

  /**
   * 送信メソッドを設定
   * @param {Function} sendMethod - 送信メソッド
   */
  setSendMethod(sendMethod) {
    this.sendMessage = sendMethod;
  }

  /**
   * リトライすべきかどうかを判定
   * @param {Error} error - エラー
   * @returns {boolean} リトライすべきかどうか
   */
  shouldRetry(error) {
    // 429エラー（レート制限）の場合はリトライしない
    if (error.status === 429 || (error.response && error.response.status === 429)) {
      return false;
    }
    
    // その他の一時的なエラーはリトライ
    return error.status >= 500 || !error.status;
  }

  /**
   * キューの状態を取得
   * @returns {Object} キュー状態
   */
  getQueueStatus() {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      remainingMessages: this.optimizer.getRemainingMessages(),
      monthlyCount: this.optimizer.monthlyMessageCount
    };
  }

  /**
   * キューをクリア
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    logger.info('Message queue cleared', { clearedCount });
  }
}

module.exports = MessageQueue;
