const mime = require('mime-types');
const config = require('../config/fileProcessing');

/**
 * ファイル処理ユーティリティ
 */
class FileUtils {
  /**
   * MIMEタイプから拡張子を取得
   * @param {string} mimeType - MIMEタイプ
   * @returns {string} 拡張子
   */
  static getExtensionFromMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return 'bin';
    }
    
    // セミコロン以降を除去（charset等のパラメータを無視）
    const baseType = mimeType.split(';')[0].trim().toLowerCase();
    
    // mime-typesライブラリを使用して拡張子を取得
    const extension = mime.extension(baseType);
    
    if (extension) {
      return extension;
    }
    
    // フォールバック: 設定ファイルのマッピングを使用
    return config.fallbackExtensions[baseType] || 'bin';
  }

  /**
   * ファイル名から拡張子を取得
   * @param {string} filename - ファイル名
   * @returns {string} 拡張子
   */
  static getExtensionFromFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return '';
    }
    
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * ファイルサイズを検証
   * @param {Buffer} content - ファイル内容
   * @param {number} maxSize - 最大サイズ（バイト）
   * @returns {Object} 検証結果
   */
  static validateFileSize(content, maxSize = config.maxFileSize) {
    const size = content.length;
    return {
      isValid: size <= maxSize,
      size,
      maxSize,
      formattedSize: this.formatFileSize(size),
      formattedMaxSize: this.formatFileSize(maxSize)
    };
  }

  /**
   * ファイルサイズを人間が読みやすい形式に変換
   * @param {number} bytes - バイト数
   * @returns {string} フォーマットされたサイズ
   */
  static formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * ファイル名を生成
   * @param {string} mimeType - MIMEタイプ
   * @param {string} messageId - メッセージID
   * @param {string} expectedType - 期待されるタイプ
   * @returns {string} 生成されたファイル名
   */
  static generateFilename(mimeType, messageId, expectedType) {
    const extension = this.getExtensionFromMimeType(mimeType);
    const actualType = mimeType.split('/')[0]; // 'image', 'video', 'audio', 'application'
    return `${actualType}_${messageId}.${extension}`;
  }

  /**
   * MIMEタイプが期待されるタイプと一致するかチェック
   * @param {string} mimeType - MIMEタイプ
   * @param {string} expectedType - 期待されるタイプ
   * @returns {boolean} 一致するかどうか
   */
  static isValidMimeTypeForExpectedType(mimeType, expectedType) {
    const validPrefixes = {
      'image': 'image/',
      'video': 'video/',
      'audio': 'audio/',
      'file': ['application/', 'text/']
    };
    
    const prefix = validPrefixes[expectedType];
    if (!prefix) return true; // 不明なタイプの場合は許可
    
    if (Array.isArray(prefix)) {
      return prefix.some(p => mimeType.startsWith(p));
    }
    
    return mimeType.startsWith(prefix);
  }
}

module.exports = FileUtils; 