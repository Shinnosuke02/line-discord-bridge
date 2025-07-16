/**
 * LINE-Discord Bridge アプリケーション
 */
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

// 設定とユーティリティ
const config = require('./config');
const logger = require('./utils/logger');

// サービス
const ChannelManager = require('./services/channelManager');
const MessageBridge = require('./services/messageBridge');

// ルート
const setupWebhookRoutes = require('./routes/webhook');

class LineDiscordBridge {
  constructor() {
    this.app = express();
    this.discordClient = null;
    this.channelManager = null;
    this.messageBridge = null;
  }

  /**
   * Discordクライアントを初期化
   */
  initializeDiscordClient() {
    this.discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Discord接続イベント
    this.discordClient.once('ready', () => {
      logger.info('Discord bot ready', { 
        username: this.discordClient.user?.username,
        guildCount: this.discordClient.guilds.cache.size 
      });
    });

    // Discordエラーハンドリング
    this.discordClient.on('error', (error) => {
      logger.error('Discord client error', error);
    });

    return this.discordClient;
  }

  /**
   * サービスを初期化
   */
  initializeServices() {
    this.channelManager = new ChannelManager(this.discordClient);
    this.messageBridge = new MessageBridge(this.discordClient, this.channelManager);
    
    logger.info('Services initialized');
  }

  /**
   * Expressアプリケーションを設定
   */
  setupExpressApp() {
    // ヘルスチェックエンドポイント
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        discord: this.discordClient?.readyAt ? 'connected' : 'disconnected'
      });
    });

    // Webhookルートを設定（LINE SDKのmiddlewareがリクエストボディを処理）
    this.app.use(setupWebhookRoutes(this.messageBridge));

    // その他のルート用のミドルウェア（Webhookエンドポイントには影響しない）
    this.app.use('/api', express.json());
    this.app.use('/api', express.urlencoded({ extended: true }));

    // 404ハンドラー
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // グローバルエラーハンドラー
    this.app.use((err, req, res, next) => {
      logger.error('Express error', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    logger.info('Express app configured');
  }

  /**
   * Discordメッセージリスナーを設定
   */
  setupDiscordMessageListener() {
    this.messageBridge.setupDiscordMessageListener();
  }

  /**
   * アプリケーションを開始
   */
  async start() {
    try {
      // Discordクライアントを初期化
      this.initializeDiscordClient();
      
      // Discordにログイン
      await this.discordClient.login(config.discord.botToken);
      
      // サービスを初期化
      this.initializeServices();
      
      // Expressアプリケーションを設定
      this.setupExpressApp();
      
      // Discordメッセージリスナーを設定
      this.setupDiscordMessageListener();
      
      // サーバーを開始
      this.app.listen(config.server.port, () => {
        logger.info('Server started', { 
          port: config.server.port,
          environment: process.env.NODE_ENV || 'development'
        });
      });

    } catch (error) {
      logger.error('Failed to start application', error);
      process.exit(1);
    }
  }

  /**
   * アプリケーションを停止
   */
  async stop() {
    try {
      if (this.discordClient) {
        this.discordClient.destroy();
        logger.info('Discord client destroyed');
      }
      
      logger.info('Application stopped');
    } catch (error) {
      logger.error('Error stopping application', error);
    }
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (global.app) {
    await global.app.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (global.app) {
    await global.app.stop();
  }
  process.exit(0);
});

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// アプリケーションを開始
const app = new LineDiscordBridge();
global.app = app; // グローバル参照を保存（クリーンアップ用）

app.start().catch((error) => {
  logger.error('Failed to start application', error);
  process.exit(1);
});

module.exports = app; 