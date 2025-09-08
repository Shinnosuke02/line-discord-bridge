const logger = require('../utils/logger');
const { fileTypeFromBuffer } = require('file-type');
const FileUtils = require('../utils/fileUtils');
const config = require('../config/fileProcessing');

/**
 * 近代化されたファイル処理クラス
 * 汎用ライブラリを使用した正確なMIMEタイプ判定とファイル処理を提供
 */
class ModernFileProcessor {
  constructor() {
    // 設定からデフォルトMIMEタイプを取得
    this.defaultMimeTypes = config.defaultMimeTypes;
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
      
      // デバッグ用: ファイルの先頭バイトを出力
      if (config.debug.logFileHeaders) {
        const header = content.slice(0, config.debug.headerAnalysisLength);
        logger.debug('File type not detected by library, analyzing header', {
          contentLength: content.length,
          headerHex: header.toString('hex'),
          headerArray: Array.from(header),
          headerString: header.toString('utf8', 0, Math.min(16, header.length))
        });
      }
      
      return 'application/octet-stream';
    } catch (error) {
      logger.error('Failed to detect MIME type', { error: error.message });
      return 'application/octet-stream';
    }
  }



  /**
   * MIMEタイプから拡張子を取得（ユーティリティを使用）
   * @param {string} mimeType - MIMEタイプ
   * @returns {string} 拡張子
   */
  getExtensionFromMimeType(mimeType) {
    return FileUtils.getExtensionFromMimeType(mimeType);
  }

  /**
   * ファイル名から拡張子を取得
   * @param {string} filename - ファイル名
   * @returns {string} 拡張子
   */
  getExtensionFromFilename(filename) {
    return FileUtils.getExtensionFromFilename(filename);
  }

  /**
   * ファイルサイズを検証
   * @param {Buffer} content - ファイル内容
   * @param {number} maxSize - 最大サイズ（バイト）
   * @returns {Object} 検証結果
   */
  validateFileSize(content, maxSize = config.maxFileSize) {
    return FileUtils.validateFileSize(content, maxSize);
  }

  /**
   * ファイルサイズを人間が読みやすい形式に変換
   * @param {number} bytes - バイト数
   * @returns {string} フォーマットされたサイズ
   */
  formatFileSize(bytes) {
    return FileUtils.formatFileSize(bytes);
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
      
      // ファイル名を生成（ユーティリティを使用）
      const filename = FileUtils.generateFilename(finalMimeType, message.id, expectedType);
      logger.info('Generated filename', { 
        filename, 
        expectedType, 
        finalMimeType 
      });
      
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
   * MIMEタイプの解決（検出されたタイプを優先）
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
    
    // 1. 検出されたMIMEタイプが有効な場合は優先使用（期待されるタイプに関係なく）
    if (
      typeof detectedMimeType === 'string' &&
      detectedMimeType !== 'application/octet-stream' &&
      detectedMimeType !== 'line'
    ) {
      logger.debug('Using detected MIME type', { 
        detectedMimeType, 
        expectedType,
        originalMimeType 
      });
      return detectedMimeType;
    }
    
    // 2. 元のMIMEタイプが有効な場合は使用（ただし期待されるタイプと一致する場合のみ）
    if (
      typeof originalMimeType === 'string' &&
      originalMimeType !== 'application/octet-stream' &&
      originalMimeType !== 'line' &&
      this.isValidMimeTypeForExpectedType(originalMimeType, expectedType)
    ) {
      logger.debug('Using original MIME type', { 
        originalMimeType, 
        expectedType 
      });
      return originalMimeType;
    }
    
    // 3. デフォルトMIMEタイプを使用
    logger.debug('Using default MIME type', { 
      defaultMimeType, 
      expectedType,
      detectedMimeType,
      originalMimeType 
    });
    return defaultMimeType;
  }

  /**
   * MIMEタイプが期待されるタイプと一致するかチェック
   * @param {string} mimeType - MIMEタイプ
   * @param {string} expectedType - 期待されるタイプ
   * @returns {boolean} 一致するかどうか
   */
  isValidMimeTypeForExpectedType(mimeType, expectedType) {
    return FileUtils.isValidMimeTypeForExpectedType(mimeType, expectedType);
  }

  // 後方互換性のためのメソッド
  processLineImage(message, content) {
    return this.processLineMedia(message, content, 'image');
  }
}

module.exports = ModernFileProcessor; 