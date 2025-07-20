const logger = require('./logger');

/**
 * エラーハンドリングユーティリティ
 */
class ErrorHandler {
  /**
   * ファイル処理エラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {string} context - エラーコンテキスト
   * @param {Object} metadata - 追加メタデータ
   * @returns {Object} エラー結果オブジェクト
   */
  static handleFileProcessingError(error, context, metadata = {}) {
    logger.error(`File processing error in ${context}`, {
      error: error.message,
      stack: error.stack,
      ...metadata
    });
    
    return {
      success: false,
      error: error.message,
      context,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * LINE APIエラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {string} operation - 操作名
   * @param {Object} metadata - 追加メタデータ
   * @returns {Object} エラー結果オブジェクト
   */
  static handleLineApiError(error, operation, metadata = {}) {
    logger.error(`LINE API error in ${operation}`, {
      error: error.message,
      stack: error.stack,
      ...metadata
    });
    
    return {
      success: false,
      error: error.message,
      operation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Discord APIエラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {string} operation - 操作名
   * @param {Object} metadata - 追加メタデータ
   * @returns {Object} エラー結果オブジェクト
   */
  static handleDiscordApiError(error, operation, metadata = {}) {
    logger.error(`Discord API error in ${operation}`, {
      error: error.message,
      stack: error.stack,
      ...metadata
    });
    
    return {
      success: false,
      error: error.message,
      operation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ネットワークエラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {string} url - リクエストURL
   * @param {Object} metadata - 追加メタデータ
   * @returns {Object} エラー結果オブジェクト
   */
  static handleNetworkError(error, url, metadata = {}) {
    logger.error(`Network error for ${url}`, {
      error: error.message,
      stack: error.stack,
      url,
      ...metadata
    });
    
    return {
      success: false,
      error: error.message,
      url,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * バリデーションエラーを処理
   * @param {string} field - フィールド名
   * @param {string} message - エラーメッセージ
   * @param {Object} metadata - 追加メタデータ
   * @returns {Object} エラー結果オブジェクト
   */
  static handleValidationError(field, message, metadata = {}) {
    logger.warn(`Validation error for ${field}`, {
      field,
      message,
      ...metadata
    });
    
    return {
      success: false,
      error: message,
      field,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * エラーを安全に処理（例外をキャッチ）
   * @param {Function} operation - 実行する操作
   * @param {string} context - コンテキスト
   * @param {Object} metadata - 追加メタデータ
   * @returns {Promise<Object>} 結果オブジェクト
   */
  static async safeExecute(operation, context, metadata = {}) {
    try {
      const result = await operation();
      return {
        success: true,
        result,
        context,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return this.handleFileProcessingError(error, context, metadata);
    }
  }
}

module.exports = ErrorHandler; 