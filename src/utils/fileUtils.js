/**
 * ファイルユーティリティ
 */
const path = require('path');
const mime = require('mime-types');

/**
 * MIMEタイプから拡張子を取得
 * @param {string} mimeType - MIMEタイプ
 * @returns {string} 拡張子
 */
const getExtensionFromMimeType = (mimeType) => {
  if (!mimeType || typeof mimeType !== 'string') return 'bin';
  const ext = mime.extension(mimeType);
  return ext || 'bin';
};

/**
 * ファイル名から拡張子を取得
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子
 */
const getExtensionFromFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ext ? ext.substring(1) : '';
};

/**
 * ファイルサイズを検証
 * @param {Buffer} content - ファイル内容
 * @param {number} maxSize - 最大サイズ（バイト）
 * @returns {Object} 検証結果
 */
const validateFileSize = (content, maxSize = 10 * 1024 * 1024) => {
  const size = content.length;
  return {
    isValid: size <= maxSize,
    size,
    maxSize,
    formattedSize: formatFileSize(size),
    formattedMaxSize: formatFileSize(maxSize)
  };
};

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param {number} bytes - バイト数
 * @returns {string} フォーマットされたサイズ
 */
const formatFileSize = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

/**
 * ファイル名を生成
 * @param {string} mimeType - MIMEタイプ
 * @param {string} messageId - メッセージID
 * @param {string} type - ファイルタイプ
 * @returns {string} ファイル名
 */
const generateFilename = (mimeType, messageId, type = 'file') => {
  const ext = getExtensionFromMimeType(mimeType);
  const timestamp = Date.now();
  return `${type}_${messageId}_${timestamp}.${ext}`;
};

/**
 * MIMEタイプが期待されるタイプと一致するかチェック
 * @param {string} mimeType - MIMEタイプ
 * @param {string} expectedType - 期待されるタイプ
 * @returns {boolean} 一致するかどうか
 */
const isValidMimeTypeForExpectedType = (mimeType, expectedType) => {
  const typeMap = {
    'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'video': ['video/mp4', 'video/quicktime', 'video/webm'],
    'audio': ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    'file': ['application/pdf', 'text/plain']
  };
  
  const validTypes = typeMap[expectedType] || [];
  return validTypes.some(type => mimeType.startsWith(type));
};

/**
 * 安全なファイル名を生成
 * @param {string} originalName - 元のファイル名
 * @returns {string} 安全なファイル名
 */
const sanitizeFilename = (originalName) => {
  return originalName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
};

module.exports = {
  getExtensionFromMimeType,
  getExtensionFromFilename,
  validateFileSize,
  formatFileSize,
  generateFilename,
  isValidMimeTypeForExpectedType,
  sanitizeFilename
};
