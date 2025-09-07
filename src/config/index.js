/**
 * アプリケーション設定
 * 環境変数から設定を読み込み、デフォルト値を提供
 */
require('dotenv').config();

const config = {
  // LINE Bot設定
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    webhookPath: process.env.LINE_WEBHOOK_PATH || '/webhook'
  },

  // Discord Bot設定
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    clientId: process.env.DISCORD_CLIENT_ID || ''
  },

  // サーバー設定
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // ファイル処理設定
  file: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    tempPath: process.env.TEMP_PATH || './temp',
    supportedImageMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp'
    ],
    supportedVideoMimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo'
    ],
    supportedAudioMimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4'
    ]
  },

  // チャンネル設定
  channel: {
    autoCreate: process.env.AUTO_CREATE_CHANNELS === 'true',
    channelPrefix: process.env.CHANNEL_PREFIX || 'line-',
    maxChannels: parseInt(process.env.MAX_CHANNELS) || 100
  },

  // メディア設定
  media: {
    imageResize: {
      enabled: process.env.IMAGE_RESIZE_ENABLED === 'true',
      maxWidth: parseInt(process.env.IMAGE_MAX_WIDTH) || 1920,
      maxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT) || 1080,
      quality: parseInt(process.env.IMAGE_QUALITY) || 80
    },
    videoCompression: {
      enabled: process.env.VIDEO_COMPRESSION_ENABLED === 'false',
      maxSize: parseInt(process.env.VIDEO_MAX_SIZE) || 50 * 1024 * 1024 // 50MB
    }
  },

  // Webhook設定
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 30000
  },

  // ログ設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.LOG_CONSOLE !== 'false',
    enableFile: process.env.LOG_FILE !== 'false',
    logDir: process.env.LOG_DIR || './logs',
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES) || 14
  },

  // セキュリティ設定
  security: {
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED === 'true',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15分
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100
    },
    cors: {
      enabled: process.env.CORS_ENABLED === 'true',
      origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
    }
  },

  // データベース設定（将来の拡張用）
  database: {
    type: process.env.DB_TYPE || 'file',
    path: process.env.DB_PATH || './data',
    backup: {
      enabled: process.env.DB_BACKUP_ENABLED === 'true',
      interval: parseInt(process.env.DB_BACKUP_INTERVAL) || 24 * 60 * 60 * 1000 // 24時間
    }
  },

  // メトリクス設定
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    port: parseInt(process.env.METRICS_PORT) || 9090,
    path: process.env.METRICS_PATH || '/metrics'
  },

  // ヘルスチェック設定
  health: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/health',
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000
  }
};

// 設定の検証
function validateConfig() {
  const errors = [];

  // 必須設定のチェック
  if (!config.line.channelSecret) {
    errors.push('LINE_CHANNEL_SECRET is required');
  }
  if (!config.line.channelAccessToken) {
    errors.push('LINE_CHANNEL_ACCESS_TOKEN is required');
  }
  if (!config.discord.botToken) {
    errors.push('DISCORD_BOT_TOKEN is required');
  }

  // 設定値の範囲チェック
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  if (config.file.maxFileSize < 1024) {
    errors.push('MAX_FILE_SIZE must be at least 1KB');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// 設定の初期化
function initializeConfig() {
  try {
    validateConfig();
    
    // ディレクトリの作成
    const fs = require('fs');
    const path = require('path');
    
    const dirs = [
      config.file.uploadPath,
      config.file.tempPath,
      config.logging.logDir,
      config.database.path
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    return config;
  } catch (error) {
    console.error('Failed to initialize configuration:', error.message);
    process.exit(1);
  }
}

module.exports = initializeConfig();