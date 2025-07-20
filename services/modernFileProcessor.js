const logger = require('../utils/logger');

/**
 * 近代化されたファイル処理クラス
 * より正確なMIMEタイプ判定とファイル処理を提供
 */
class ModernFileProcessor {
  constructor() {
    // 拡張されたMIMEタイプマッピング
    this.mimeTypeMap = {
      // 画像
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/svg+xml': 'svg',
      
      // 動画
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/avi': 'avi',
      'video/wmv': 'wmv',
      'video/flv': 'flv',
      'video/webm': 'webm',
      'video/mpeg': 'mpg',
      'video/3gpp': '3gp',
      'video/x-msvideo': 'avi',
      
      // 音声
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/m4a': 'm4a',
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/webm': 'webm',
      'audio/x-wav': 'wav',
      
      // ドキュメント
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/csv': 'csv',
      
      // アーカイブ
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
      'application/x-7z-compressed': '7z',
      'application/gzip': 'gz',
    };

    // ファイルシグネチャ（マジックナンバー）
    this.fileSignatures = {
      // 画像
      jpeg: [0xFF, 0xD8],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46],
      webp: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
      bmp: [0x42, 0x4D],
      
      // 動画
      mp4: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], // MP4 variant 1
      mp4_alt: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // MP4 variant 2
      mov: [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74], // QuickTime
      avi: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x41, 0x56, 0x49],
      webm: [0x1A, 0x45, 0xDF, 0xA3],
      
      // 音声
      mp3: [0x49, 0x44, 0x33], // ID3 tag
      mp3_alt: [0xFF, 0xFB], // MPEG-1 Layer 3
      wav: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45],
      m4a: [0x4D, 0x34, 0x41], // M4A
      flac: [0x66, 0x4C, 0x61, 0x43], // "fLaC"
      
      // ドキュメント
      pdf: [0x25, 0x50, 0x44, 0x46], // "%PDF"
      zip: [0x50, 0x4B, 0x03, 0x04], // PK\x03\x04
      zip_alt: [0x50, 0x4B, 0x05, 0x06], // PK\x05\x06 (empty archive)
      zip_alt2: [0x50, 0x4B, 0x07, 0x08], // PK\x07\x08 (spanned archive)
    };
  }

  /**
   * ファイルの先頭バイトからMIMEタイプを判定（強化版）
   * @param {Buffer} content - ファイル内容
   * @returns {string} MIMEタイプ
   */
  detectMimeTypeFromContent(content) {
    if (!content || content.length < 4) {
      return 'application/octet-stream';
    }

    const header = content.slice(0, 16);
    
    // 画像判定
    if (this.matchesSignature(header, this.fileSignatures.jpeg)) {
      return 'image/jpeg';
    }
    if (this.matchesSignature(header, this.fileSignatures.png)) {
      return 'image/png';
    }
    if (this.matchesSignature(header, this.fileSignatures.gif)) {
      return 'image/gif';
    }
    if (this.matchesSignature(header, this.fileSignatures.webp)) {
      return 'image/webp';
    }
    if (this.matchesSignature(header, this.fileSignatures.bmp)) {
      return 'image/bmp';
    }
    
    // 動画判定
    if (this.matchesSignature(header, this.fileSignatures.mp4) || 
        this.matchesSignature(header, this.fileSignatures.mp4_alt)) {
      return 'video/mp4';
    }
    if (this.matchesSignature(header, this.fileSignatures.mov)) {
      return 'video/quicktime';
    }
    if (this.matchesSignature(header, this.fileSignatures.avi)) {
      return 'video/avi';
    }
    if (this.matchesSignature(header, this.fileSignatures.webm)) {
      return 'video/webm';
    }
    
    // 音声判定
    if (this.matchesSignature(header, this.fileSignatures.mp3) || 
        this.matchesSignature(header, this.fileSignatures.mp3_alt)) {
      return 'audio/mpeg';
    }
    if (this.matchesSignature(header, this.fileSignatures.wav)) {
      return 'audio/wav';
    }
    if (this.matchesSignature(header, this.fileSignatures.m4a)) {
      return 'audio/m4a';
    }
    if (this.matchesSignature(header, this.fileSignatures.flac)) {
      return 'audio/flac';
    }
    
    // ドキュメント判定
    if (this.matchesSignature(header, this.fileSignatures.pdf)) {
      return 'application/pdf';
    }
    if (this.matchesSignature(header, this.fileSignatures.zip) || 
        this.matchesSignature(header, this.fileSignatures.zip_alt) ||
        this.matchesSignature(header, this.fileSignatures.zip_alt2)) {
      return 'application/zip';
    }

    return 'application/octet-stream';
  }

  /**
   * バイトシグネチャの一致を確認（強化版）
   * @param {Buffer} header - ファイルヘッダー
   * @param {Array} signature - シグネチャ配列
   * @returns {boolean} 一致するかどうか
   */
  matchesSignature(header, signature) {
    if (header.length < signature.length) {
      return false;
    }
    
    for (let i = 0; i < signature.length; i++) {
      if (signature[i] !== null && header[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * MIMEタイプから拡張子を取得（強化版）
   * @param {string} mimeType - MIMEタイプ
   * @returns {string} 拡張子
   */
  getExtensionFromMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return 'bin';
    }
    
    // セミコロン以降を除去（charset等のパラメータを無視）
    const baseType = mimeType.split(';')[0].trim().toLowerCase();
    return this.mimeTypeMap[baseType] || 'bin';
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
   * 汎用メディアメッセージの処理（近代化版）
   * @param {Object} message - LINEメッセージ
   * @param {Buffer} content - バイナリデータ
   * @param {string} expectedType - 期待されるメッセージタイプ（'image', 'video', 'audio', 'file'）
   * @returns {Object} 処理結果
   */
  processLineMedia(message, content, expectedType) {
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
      
      // ファイル内容からMIMEタイプを判定
      const detectedMimeType = this.detectMimeTypeFromContent(content);
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