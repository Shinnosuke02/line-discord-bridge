/**
 * アプリケーション設定
 * 環境変数から設定を読み込み、バリデーションを行う
 */
require('dotenv').config();

const config = {
  // アプリケーション基本設定
  app: {
    name: 'LINE-Discord Bridge',
    version: '3.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  // LINE Bot設定
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    apiVersion: 'v7'
  },
  
  // Discord Bot設定
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    intents: ['Guilds', 'GuildMessages', 'MessageContent']
  },
  
  // ファイル処理設定
  files: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    allowedAudioTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    tempDir: process.env.TEMP_DIR || './temp'
  },

  // メッセージ処理設定
  messaging: {
    batchDelay: parseInt(process.env.BATCH_DELAY, 10) || 100,
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE, 10) || 5,
    downloadTimeout: parseInt(process.env.DOWNLOAD_TIMEOUT, 10) || 30000,
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY, 10) || 1000
  },

  // Webhook設定
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    name: process.env.WEBHOOK_NAME || 'LINE Bridge',
    avatarUrl: process.env.WEBHOOK_AVATAR_URL
  },

  // ログ設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 14,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
  },

  // データベース設定（将来の拡張用）
  database: {
    type: process.env.DB_TYPE || 'file',
    path: process.env.DB_PATH || './data',
    maxMappings: parseInt(process.env.MAX_MAPPINGS, 10) || 10000
  },

  // セキュリティ設定
  security: {
    uploadApiKey: process.env.UPLOAD_API_KEY,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 900000, // 15分
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
  }
};

// 必須環境変数の検証
const requiredEnvVars = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// 設定の検証
if (config.app.environment === 'production') {
  if (!config.security.uploadApiKey) {
    console.warn('Warning: UPLOAD_API_KEY not set in production environment');
  }
}

module.exports = config;
