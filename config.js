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
};

// 必須環境変数の検証
const requiredEnvVars = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = config; 