/**
 * ファイルユーティリティ
 * ファイル操作に関するヘルパー関数
 */
const fs = require('fs').promises;
const path = require('path');
const fileType = require('file-type');
const mimeTypes = require('mime-types');
const logger = require('./logger');

/**
 * ファイルタイプを検出
 * @param {Buffer} buffer - ファイルバッファ
 * @returns {Object|null} ファイルタイプ情報
 */
async function detectFileType(buffer) {
  try {
    const fileTypeInfo = await fileType.fromBuffer(buffer);
    
    logger.debug('File type detected', {
      mimeType: fileTypeInfo?.mime,
      extension: fileTypeInfo?.ext
    });

    return fileTypeInfo;
  } catch (error) {
    logger.error('Failed to detect file type', {
      error: error.message
    });
    return null;
  }
}

/**
 * ファイル拡張子を取得
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子
 */
function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

/**
 * MIMEタイプを取得
 * @param {string} filename - ファイル名
 * @returns {string} MIMEタイプ
 */
function getMimeType(filename) {
  return mimeTypes.lookup(filename) || 'application/octet-stream';
}

/**
 * ファイルサイズを検証
 * @param {number} size - ファイルサイズ
 * @param {number} maxSize - 最大サイズ
 * @returns {boolean} 有効かどうか
 */
function validateFileSize(size, maxSize = 10 * 1024 * 1024) { // デフォルト10MB
  return size <= maxSize;
}

/**
 * ファイル名をサニタイズ
 * @param {string} filename - ファイル名
 * @returns {string} サニタイズされたファイル名
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * ファイルが存在するか確認
 * @param {string} filePath - ファイルパス
 * @returns {boolean} 存在するかどうか
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ディレクトリを作成
 * @param {string} dirPath - ディレクトリパス
 * @returns {boolean} 作成成功
 */
async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    logger.error('Failed to create directory', {
      dirPath,
      error: error.message
    });
    return false;
  }
}

/**
 * ファイルを削除
 * @param {string} filePath - ファイルパス
 * @returns {boolean} 削除成功
 */
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
    logger.debug('File deleted', { filePath });
    return true;
  } catch (error) {
    logger.error('Failed to delete file', {
      filePath,
      error: error.message
    });
    return false;
  }
}

/**
 * ファイル情報を取得
 * @param {string} filePath - ファイルパス
 * @returns {Object|null} ファイル情報
 */
async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    logger.error('Failed to get file info', {
      filePath,
      error: error.message
    });
    return null;
  }
}

/**
 * 一時ファイル名を生成
 * @param {string} prefix - プレフィックス
 * @param {string} extension - 拡張子
 * @returns {string} 一時ファイル名
 */
function generateTempFilename(prefix = 'temp', extension = 'tmp') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}.${extension}`;
}

/**
 * ファイルをコピー
 * @param {string} sourcePath - ソースパス
 * @param {string} destPath - デスティネーションパス
 * @returns {boolean} コピー成功
 */
async function copyFile(sourcePath, destPath) {
  try {
    await fs.copyFile(sourcePath, destPath);
    logger.debug('File copied', { sourcePath, destPath });
    return true;
  } catch (error) {
    logger.error('Failed to copy file', {
      sourcePath,
      destPath,
      error: error.message
    });
    return false;
  }
}

/**
 * ファイルを移動
 * @param {string} sourcePath - ソースパス
 * @param {string} destPath - デスティネーションパス
 * @returns {boolean} 移動成功
 */
async function moveFile(sourcePath, destPath) {
  try {
    await fs.rename(sourcePath, destPath);
    logger.debug('File moved', { sourcePath, destPath });
    return true;
  } catch (error) {
    logger.error('Failed to move file', {
      sourcePath,
      destPath,
      error: error.message
    });
    return false;
  }
}

/**
 * ファイルを読み込み
 * @param {string} filePath - ファイルパス
 * @param {string} encoding - エンコーディング
 * @returns {string|Buffer} ファイル内容
 */
async function readFile(filePath, encoding = 'utf8') {
  try {
    const content = await fs.readFile(filePath, encoding);
    logger.debug('File read', { filePath, size: content.length });
    return content;
  } catch (error) {
    logger.error('Failed to read file', {
      filePath,
      error: error.message
    });
    throw error;
  }
}

/**
 * ファイルに書き込み
 * @param {string} filePath - ファイルパス
 * @param {string|Buffer} content - 内容
 * @param {string} encoding - エンコーディング
 * @returns {boolean} 書き込み成功
 */
async function writeFile(filePath, content, encoding = 'utf8') {
  try {
    await fs.writeFile(filePath, content, encoding);
    logger.debug('File written', { filePath, size: content.length });
    return true;
  } catch (error) {
    logger.error('Failed to write file', {
      filePath,
      error: error.message
    });
    return false;
  }
}

/**
 * 画像ファイルかどうかを判定
 * @param {string} mimeType - MIMEタイプ
 * @returns {boolean} 画像ファイルかどうか
 */
function isImageFile(mimeType) {
  const imageTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/svg+xml'
  ];
  return imageTypes.includes(mimeType);
}

/**
 * 動画ファイルかどうかを判定
 * @param {string} mimeType - MIMEタイプ
 * @returns {boolean} 動画ファイルかどうか
 */
function isVideoFile(mimeType) {
  const videoTypes = [
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'video/flv',
    'video/webm',
    'video/mkv',
    'video/quicktime'
  ];
  return videoTypes.includes(mimeType);
}

/**
 * 音声ファイルかどうかを判定
 * @param {string} mimeType - MIMEタイプ
 * @returns {boolean} 音声ファイルかどうか
 */
function isAudioFile(mimeType) {
  const audioTypes = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp3',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
    'audio/webm'
  ];
  return audioTypes.includes(mimeType);
}

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param {number} bytes - バイト数
 * @returns {string} フォーマットされたサイズ
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  detectFileType,
  getFileExtension,
  getMimeType,
  validateFileSize,
  sanitizeFilename,
  fileExists,
  ensureDirectory,
  deleteFile,
  getFileInfo,
  generateTempFilename,
  copyFile,
  moveFile,
  readFile,
  writeFile,
  isImageFile,
  isVideoFile,
  isAudioFile,
  formatFileSize
};