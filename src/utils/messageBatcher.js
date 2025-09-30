/**
 * メッセージバッチングユーティリティ
 * 2分以内の同じ宛先への複数メッセージを1つにまとめる
 */
const logger = require('./logger');

class MessageBatcher {
  constructor() {
    this.batchQueue = new Map(); // userId -> messageBatch
    this.batchTimeout = 120000; // 2分（120秒）
    this.maxBatchSize = 10; // 最大10メッセージまで統合
  }

  /**
   * メッセージをバッチに追加
   * @param {string} userId - LINEユーザーID
   * @param {Object} message - メッセージ
   * @param {Function} sendCallback - 送信コールバック
   */
  addToBatch(userId, message, sendCallback) {
    // テキストメッセージのみバッチング対象
    if (message.type !== 'text') {
      // テキスト以外は即座に送信
      this.flushBatch(userId);
      sendCallback([message]);
      return;
    }

    if (!this.batchQueue.has(userId)) {
      this.batchQueue.set(userId, {
        messages: [],
        sendCallback,
        timeout: null,
        lastMessageTime: Date.now()
      });
    }

    const batch = this.batchQueue.get(userId);
    batch.messages.push(message);
    batch.lastMessageTime = Date.now();

    logger.debug('Message added to batch', {
      userId,
      messageCount: batch.messages.length,
      messageText: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : '')
    });

    // バッチサイズが上限に達した場合は即座に送信
    if (batch.messages.length >= this.maxBatchSize) {
      this.flushBatch(userId);
      return;
    }

    // タイムアウトを設定（最初のメッセージのみ）
    if (batch.messages.length === 1) {
      batch.timeout = setTimeout(() => {
        this.flushBatch(userId);
      }, this.batchTimeout);
    }
  }

  /**
   * バッチを送信
   * @param {string} userId - LINEユーザーID
   */
  flushBatch(userId) {
    const batch = this.batchQueue.get(userId);
    if (!batch || batch.messages.length === 0) {
      return;
    }

    // タイムアウトをクリア
    if (batch.timeout) {
      clearTimeout(batch.timeout);
    }

    // メッセージを統合
    const mergedMessages = this.mergeMessages(batch.messages);
    
    // 送信
    batch.sendCallback(mergedMessages);
    
    // バッチをクリア
    this.batchQueue.delete(userId);

    logger.info('Message batch sent', {
      userId,
      originalCount: batch.messages.length,
      mergedCount: mergedMessages.length,
      timeElapsed: Date.now() - batch.lastMessageTime
    });
  }

  /**
   * メッセージを統合
   * @param {Array} messages - メッセージ配列
   * @returns {Array} 統合されたメッセージ配列
   */
  mergeMessages(messages) {
    if (messages.length <= 1) {
      return messages;
    }

    // テキストメッセージを統合
    const textMessages = messages.filter(msg => msg.type === 'text');
    const otherMessages = messages.filter(msg => msg.type !== 'text');

    if (textMessages.length > 1) {
      // メッセージ間を改行で区切って統合
      const combinedText = textMessages.map(msg => msg.text).join('\n');
      const mergedMessage = {
        type: 'text',
        text: combinedText
      };
      return [mergedMessage, ...otherMessages];
    }

    return messages;
  }

  /**
   * 全てのバッチを強制送信
   */
  flushAllBatches() {
    for (const userId of this.batchQueue.keys()) {
      this.flushBatch(userId);
    }
  }

  /**
   * 特定のユーザーのバッチを強制送信
   * @param {string} userId - LINEユーザーID
   */
  flushUserBatch(userId) {
    this.flushBatch(userId);
  }

  /**
   * バッチの状態を取得
   * @returns {Object} バッチ状態
   */
  getBatchStatus() {
    const status = {
      activeBatches: this.batchQueue.size,
      totalPendingMessages: 0,
      batchDetails: []
    };

    for (const [userId, batch] of this.batchQueue.entries()) {
      status.totalPendingMessages += batch.messages.length;
      status.batchDetails.push({
        userId,
        messageCount: batch.messages.length,
        timeSinceLastMessage: Date.now() - batch.lastMessageTime
      });
    }

    return status;
  }

  /**
   * バッチング設定を更新
   * @param {Object} newConfig - 新しい設定
   */
  updateConfig(newConfig) {
    if (newConfig.batchTimeout) {
      this.batchTimeout = newConfig.batchTimeout;
    }
    if (newConfig.maxBatchSize) {
      this.maxBatchSize = newConfig.maxBatchSize;
    }
    
    logger.info('Message batcher config updated', {
      batchTimeout: this.batchTimeout,
      maxBatchSize: this.maxBatchSize
    });
  }
}

module.exports = MessageBatcher;