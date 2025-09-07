/**
 * LINE-Discord Bridge Application
 * 双方向メッセージングと返信機能をサポート
 */
const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const logger = require('./utils/logger');
const MessageBridge = require('./services/MessageBridge');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { securityHeaders } = require('./middleware/security');

/**
 * アプリケーションクラス
 */
class App {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.messageBridge = new MessageBridge();
    this.isShuttingDown = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  /**
   * ミドルウェアの設定
   */
  setupMiddleware() {
    // リクエストログ
    this.app.use(requestLogger);
    
    // セキュリティヘッダー
    this.app.use(securityHeaders);
    
    // JSONパーサー
    this.app.use(express.json({ 
      limit: config.files.maxFileSize,
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: config.files.maxFileSize 
    }));

    // 静的ファイル配信
    this.app.use('/uploads', express.static(config.files.uploadDir));
  }

  /**
   * ルートの設定
   */
  setupRoutes() {
    // ヘルスチェック
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: config.app.version,
        environment: config.app.environment
      });
    });

    // メトリクス
    this.app.get('/metrics', (req, res) => {
      const metrics = this.messageBridge.getMetrics();
      res.status(200).json(metrics);
    });

    // LINE Webhook
    this.app.post('/webhook', async (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ error: 'Service is shutting down' });
      }

      try {
        // LINE署名を検証
        const signature = req.headers['x-line-signature'];
        if (!signature) {
          logger.warn('Missing LINE signature');
          return res.status(400).json({ error: 'Missing signature' });
        }

        // イベントを処理
        const events = req.body.events || [];
        logger.info('Processing LINE webhook', { eventCount: events.length });

        for (const event of events) {
          try {
            await this.messageBridge.handleLineEvent(event);
          } catch (error) {
            logger.error('Failed to handle LINE event', {
              eventId: event.message?.id,
              error: error.message,
              stack: error.stack
            });
          }
        }
        
        res.status(200).json({ success: true });
        
      } catch (error) {
        logger.error('LINE webhook error', {
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ファイルアップロード（管理者用）
    this.app.post('/upload', async (req, res) => {
      try {
        // 認証チェック
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== config.security.uploadApiKey) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // ファイルアップロード処理
        const result = await this.messageBridge.handleFileUpload(req);
        res.status(200).json(result);
      } catch (error) {
        logger.error('File upload failed', { error: error.message });
        res.status(500).json({ error: 'Upload failed' });
      }
    });

    // 404ハンドラー
    this.app.use(notFoundHandler);
  }

  /**
   * エラーハンドリングの設定
   */
  setupErrorHandling() {
    // グローバルエラーハンドラー
    this.app.use(errorHandler);

    // 未処理のPromise拒否
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise
      });
    });

    // 未処理の例外
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      
      this.shutdown();
    });
  }

  /**
   * グレースフルシャットダウンの設定
   */
  setupGracefulShutdown() {
    const shutdown = (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      this.shutdown();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * アプリケーションを開始
   */
  async start() {
    try {
      // 必要なディレクトリを作成
      await this.ensureDirectories();
      
      // MessageBridgeを開始
      await this.messageBridge.start();
      
      // HTTPサーバーを開始
      await new Promise((resolve, reject) => {
        this.server.listen(config.app.port, config.app.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      logger.info('Application started successfully', {
        port: config.app.port,
        host: config.app.host,
        environment: config.app.environment,
        nodeVersion: process.version,
        platform: process.platform
      });

    } catch (error) {
      logger.error('Failed to start application', { error: error.message });
      throw error;
    }
  }

  /**
   * 必要なディレクトリを作成
   */
  async ensureDirectories() {
    const directories = [
      config.files.uploadDir,
      config.files.tempDir,
      './data',
      './logs'
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug('Created directory', { directory: dir });
      }
    }
  }

  /**
   * アプリケーションを停止
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting application shutdown');

    try {
      // HTTPサーバーを停止
      if (this.server.listening) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server stopped');
      }

      // MessageBridgeを停止
      await this.messageBridge.stop();
      logger.info('MessageBridge stopped');

      logger.info('Application shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * アプリケーションの状態を取得
   */
  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      serverListening: this.server.listening,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    };
  }
}

// アプリケーションインスタンスを作成
const app = new App();

// アプリケーションを開始
app.start().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});

module.exports = app;
