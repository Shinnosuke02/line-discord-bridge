/**
 * 統一されたエラークラス
 * アプリケーション全体で一貫したエラーハンドリングを提供
 */

class ChannelManagerError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'ChannelManagerError';
    this.code = code;
  }
}

class MessageBridgeError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'MessageBridgeError';
    this.code = code;
  }
}

class MediaServiceError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'MediaServiceError';
    this.code = code;
  }
}

// エラーコード定数
const ErrorCodes = {
  // ChannelManager
  CHANNEL_MANAGER_NOT_INITIALIZED: 'CHANNEL_MANAGER_NOT_INITIALIZED',
  NO_GUILD_AVAILABLE: 'NO_GUILD_AVAILABLE',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  MAPPING_NOT_FOUND: 'MAPPING_NOT_FOUND',
  
  // MessageBridge
  MESSAGE_PROCESSING_FAILED: 'MESSAGE_PROCESSING_FAILED',
  DISCORD_SEND_FAILED: 'DISCORD_SEND_FAILED',
  LINE_SEND_FAILED: 'LINE_SEND_FAILED',
  
  // MediaService
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  FILE_PROCESSING_FAILED: 'FILE_PROCESSING_FAILED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE'
};

module.exports = {
  ChannelManagerError,
  MessageBridgeError,
  MediaServiceError,
  ErrorCodes
}; 