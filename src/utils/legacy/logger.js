/**
 * ログユーティリティ
 */
class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  /**
   * ログレベルをチェック
   * @param {string} level - ログレベル
   * @returns {boolean} ログを出力するかどうか
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  /**
   * タイムスタンプ付きログメッセージを生成
   * @param {string} level - ログレベル
   * @param {string} message - ログメッセージ
   * @param {Object} [data] - 追加データ
   * @returns {string} フォーマットされたログメッセージ
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  /**
   * エラーログ
   * @param {string} message - エラーメッセージ
   * @param {Error|Object} [error] - エラーオブジェクト
   */
  error(message, error = null) {
    if (!this.shouldLog('error')) return;
    
    if (error) {
      console.error(this.formatMessage('error', message, {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }));
    } else {
      console.error(this.formatMessage('error', message));
    }
  }

  /**
   * 警告ログ
   * @param {string} message - 警告メッセージ
   * @param {Object} [data] - 追加データ
   */
  warn(message, data = null) {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, data));
  }

  /**
   * 情報ログ
   * @param {string} message - 情報メッセージ
   * @param {Object} [data] - 追加データ
   */
  info(message, data = null) {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage('info', message, data));
  }

  /**
   * デバッグログ
   * @param {string} message - デバッグメッセージ
   * @param {Object} [data] - 追加データ
   */
  debug(message, data = null) {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message, data));
  }
}

module.exports = new Logger(); 