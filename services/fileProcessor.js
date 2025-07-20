const logger = require('./logger');

/**
 * ファイル処理を専門に扱うクラス
 * MIMEタイプ判定、拡張子変換、ファイル検証を担当
 */
class FileProcessor {
  constructor() {
    this.mimeTypeMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'application/pdf': 'pdf',
    };

    this.fileSignatures = {
      jpeg: [0xFF, 0xD8],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46],
      webp: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
    };
  }

  /**
   * ファイルの先頭バイトからMIMEタイプを判定
   * @param {Buffer} content - ファイル内容
   * @returns {string} MIMEタイプ
   */
  detectMimeTypeFromContent(content) {
    if (!content || content.length < 4) {
      return 'application/octet-stream';
    }

    const header = content.slice(0, 12);
    
    // JPEG判定
    if (this.matchesSignature(header, this.fileSignatures.jpeg)) {
      return 'image/jpeg';
    }
    
    // PNG判定
    if (this.matchesSignature(header, this.fileSignatures.png)) {
      return 'image/png';
    }
    
    // GIF判定
    if (this.matchesSignature(header, this.fileSignatures.gif)) {
      return 'image/gif';
    }
    
    // WebP判定
    if (this.matchesSignature(header, this.fileSignatures.webp)) {
      return 'image/webp';
    }

    return 'application/octet-stream';
  }

  /**
   * バイトシグネチャの一致を確認
   * @param {Buffer} header - ファイルヘッダー
   * @param {Array} signature - シグネチャ配列
   * @returns {boolean} 一致するかどうか
   */
  matchesSignature(header, signature) {
    for (let i = 0; i < signature.length; i++) {
      if (signature[i] !== null && header[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * MIMEタイプから拡張子を取得
   * @param {string} mimeType - MIMEタイプ
   * @returns {string} 拡張子
   */
  getExtensionFromMimeType(mimeType) {
    return this.mimeTypeMap[mimeType] || 'bin';
  }

  /**
   * ファイル名から拡張子を取得
   * @param {string} filename - ファイル名
   * @returns {string} 拡張子
   */
  getExtensionFromFilename(filename) {
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
   * LINE画像メッセージの処理
   * @param {Object} message - LINE画像メッセージ
   * @param {Buffer} content - 画像データ
   * @returns {Object} 処理結果
   */
  processLineImage(message, content) {
    try {
      // 元のMIMEタイプを取得
      const originalMimeType = message.contentProvider?.type;
      
      // ファイル内容からMIMEタイプを判定
      const detectedMimeType = this.detectMimeTypeFromContent(content);
      
      // 最終的なMIMEタイプを決定
      const finalMimeType = this.resolveMimeType(originalMimeType, detectedMimeType);
      
      // 拡張子を取得
      const extension = this.getExtensionFromMimeType(finalMimeType);
      
      // ファイル名を生成
      const filename = `line_image_${message.id}.${extension}`;
      
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
        detectedMimeType
      };

      logger.debug('LINE image processed', {
        messageId: message.id,
        ...result
      });

      return result;
    } catch (error) {
      logger.error('Failed to process LINE image', {
        messageId: message.id,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * MIMEタイプの解決（優先順位付き）
   * @param {string} originalMimeType - 元のMIMEタイプ
   * @param {string} detectedMimeType - 検出されたMIMEタイプ
   * @returns {string} 最終的なMIMEタイプ
   */
  resolveMimeType(originalMimeType, detectedMimeType) {
    // 元のMIMEタイプが有効な場合は使用
    if (originalMimeType && originalMimeType !== 'application/octet-stream') {
      return originalMimeType;
    }
    
    // 検出されたMIMEタイプが有効な場合は使用
    if (detectedMimeType && detectedMimeType !== 'application/octet-stream') {
      return detectedMimeType;
    }
    
    // デフォルトはJPEG
    return 'image/jpeg';
  }
}

module.exports = FileProcessor; 