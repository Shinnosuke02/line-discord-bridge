const logger = require('../utils/logger');
const { fileTypeFromBuffer } = require('file-type');
const mime = require('mime-types');

/**
 * 近代化されたファイル処理クラス
 * 汎用ライブラリを使用した正確なMIMEタイプ判定とファイル処理を提供
 */
class ModernFileProcessor {
  constructor() {
    // 期待されるタイプに基づくデフォルトMIMEタイプ
    this.defaultMimeTypes = {
      'image': 'image/jpeg',
      'video': 'video/mp4',
      'audio': 'audio/m4a',
      'file': 'application/octet-stream'
    };
  }

  /**
   * ファイルの先頭バイトからMIMEタイプを判定（汎用ライブラリ使用）
   * @param {Buffer} content - ファイル内容
   * @returns {Promise<string>} MIMEタイプ
   */
  async detectMimeTypeFromContent(content) {
    if (!content || content.length < 4) {
      return 'application/octet-stream';
    }

    try {
      // file-typeライブラリを使用してMIMEタイプを判定
      const fileType = await fileTypeFromBuffer(content);
      
      if (fileType) {
        logger.debug('File type detected by library', {
          mime: fileType.mime,
          ext: fileType.ext,
          contentLength: content.length
        });
        return fileType.mime;
      }
      
      logger.debug('File type not detected by library, using fallback', {
        contentLength: content.length
      });
      return 'application/octet-stream';
    } catch (error) {
      logger.error('Failed to detect MIME type', { error: error.message });
      return 'application/octet-stream';
    }
  }



  /**
   * MIMEタイプから拡張子を取得（汎用ライブラリ使用）
   * @param {string} mimeType - MIMEタイプ
   * @returns {string} 拡張子
   */
  getExtensionFromMimeType(mimeType) {
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
    
    // フォールバック: 一般的な拡張子マッピング
    const fallbackMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/m4a': 'm4a',
      'application/pdf': 'pdf',
      'application/zip': 'zip'
    };
    
    return fallbackMap[baseType] || 'bin';
  }

  /**
   * ファイル名から拡張子を取得
   * @param {string} filename - ファイル名
   * @returns {string} 拡張子
   */
  getExtensionFromFilename(filename) {
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
  validateFileSize(content, maxSize = 10 * 1024 * 1024) {
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
  formatFileSize(bytes) {
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
   * 汎用メディアメッセージの処理（汎用ライブラリ使用版）
   * @param {Object} message - LINEメッセージ
   * @param {Buffer} content - バイナリデータ
   * @param {string} expectedType - 期待されるメッセージタイプ（'image', 'video', 'audio', 'file'）
   * @returns {Promise<Object>} 処理結果
   */
  async processLineMedia(message, content, expectedType) {
    try {
      logger.info('=== Modern LINE Media Processing Start ===', {
        messageId: message.id,
        contentLength: content.length,
        messageKeys: Object.keys(message),
        contentProvider: message.contentProvider,
        expectedType
      });

      // 元のMIMEタイプを取得
      const originalMimeType = message.contentProvider?.type;
      logger.info('Original MIME type', { originalMimeType });
      
      // ファイル内容からMIMEタイプを判定（非同期）
      const detectedMimeType = await this.detectMimeTypeFromContent(content);
      logger.info('Detected MIME type', { detectedMimeType });
      
      // 最終的なMIMEタイプを決定（期待されるタイプを優先）
      let finalMimeType = this.resolveMimeType(originalMimeType, detectedMimeType, expectedType);
      logger.info('Final MIME type', { finalMimeType });
      
      // 拡張子を取得
      const extension = this.getExtensionFromMimeType(finalMimeType);
      logger.info('File extension', { extension });
      
      // ファイル名を生成
      const filename = `${expectedType}_${message.id}.${extension}`;
      logger.info('Generated filename', { filename });
      
      // ファイルサイズを検証
      const sizeValidation = this.validateFileSize(content);
      
      const result = {
        success: true,
        filename,
        mimeType: finalMimeType,
        extension,
        size: content.length,
        sizeValidation,
        originalMimeType,
        detectedMimeType,
        expectedType
      };

      logger.info('=== Modern LINE Media Processing Complete ===', {
        messageId: message.id,
        result
      });

      return result;
    } catch (error) {
      logger.error('Failed to process LINE media', {
        messageId: message.id,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * MIMEタイプの解決（期待されるタイプを考慮）
   * @param {string} originalMimeType - 元のMIMEタイプ
   * @param {string} detectedMimeType - 検出されたMIMEタイプ
   * @param {string} expectedType - 期待されるメッセージタイプ
   * @returns {string} 最終的なMIMEタイプ
   */
  resolveMimeType(originalMimeType, detectedMimeType, expectedType) {
    // 期待されるタイプに基づくデフォルトMIMEタイプ
    const defaultMimeTypes = {
      'image': 'image/jpeg',
      'video': 'video/mp4',
      'audio': 'audio/m4a',
      'file': 'application/octet-stream'
    };
    
    const defaultMimeType = defaultMimeTypes[expectedType] || 'application/octet-stream';
    
    // 1. 元のMIMEタイプが有効な場合は使用（ただし期待されるタイプと一致する場合のみ）
    if (
      typeof originalMimeType === 'string' &&
      originalMimeType !== 'application/octet-stream' &&
      originalMimeType !== 'line' &&
      this.isValidMimeTypeForExpectedType(originalMimeType, expectedType)
    ) {
      return originalMimeType;
    }
    
    // 2. 検出されたMIMEタイプが有効な場合は使用
    if (
      typeof detectedMimeType === 'string' &&
      detectedMimeType !== 'application/octet-stream' &&
      this.isValidMimeTypeForExpectedType(detectedMimeType, expectedType)
    ) {
      return detectedMimeType;
    }
    
    // 3. デフォルトMIMEタイプを使用
    return defaultMimeType;
  }

  /**
   * MIMEタイプが期待されるタイプと一致するかチェック
   * @param {string} mimeType - MIMEタイプ
   * @param {string} expectedType - 期待されるタイプ
   * @returns {boolean} 一致するかどうか
   */
  isValidMimeTypeForExpectedType(mimeType, expectedType) {
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

  // 後方互換性のためのメソッド
  processLineImage(message, content) {
    return this.processLineMedia(message, content, 'image');
  }
}

module.exports = ModernFileProcessor; 