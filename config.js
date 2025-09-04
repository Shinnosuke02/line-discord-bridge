/**
 * アプリケーション設定
 */
require('dotenv').config();

const config = {
  // LINE設定
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  },
  
  // Instagram設定
  instagram: {
    // Basic Display API（個人アカウント用）
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    appSecret: process.env.INSTAGRAM_APP_SECRET,
    verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN,
    // Graph API（ビジネスアカウント用）
    graphAccessToken: process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN,
    businessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  },
  
  // Discord設定
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  
  // サーバー設定
  server: {
    port: process.env.PORT || 3000,
  },
  
  // ファイルパス
  files: {
    userChannelMap: './userChannelMap.json',
    channelMappings: './data/channel-mappings.json',
  },
  
  // チャンネル名設定
  channel: {
    maxLength: 85,
    maxSuffix: 999,
    suffixPadding: 3,
  },

  // メディア処理設定
  media: {
    // ファイルサイズ制限（バイト）
    maxFileSize: 10 * 1024 * 1024, // 10MB
    // ダウンロードタイムアウト（ミリ秒）
    downloadTimeout: 30000, // 30秒
    // バッチ処理間隔（ミリ秒）
    batchDelay: 100,
    // 最大バッチサイズ
    maxBatchSize: 5,
  },

  // Webhook設定
  webhook: {
    // Webhook機能の有効/無効
    enabled: process.env.WEBHOOK_ENABLED === 'true' || false,
    // Webhook名
    name: process.env.WEBHOOK_NAME || 'LINE Bridge',
  },

  // Cloudinary設定
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};

// 必須環境変数の検証
const requiredEnvVars = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_APP_SECRET',
  'INSTAGRAM_VERIFY_TOKEN',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = config; 