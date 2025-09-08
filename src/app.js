/**
 * LINE-Discord Bridge アプリケーション
 * メインアプリケーションファイル
 */
const express = require('express');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const MessageBridge = require('./services/MessageBridge');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { securityMiddleware } = require('./middleware/security');

/**
 * アプリケーションクラス
 */
class App {
  constructor() {
    this.app = express();
    this.messageBridge = null;
    this.server = null;
  }

  /**
   * アプリケーションの初期化
   */
  async initialize() {
    try {
      // ミドルウェアの設定
      this.setupMiddleware();
      
      // ルートの設定
      this.setupRoutes();
      
      // エラーハンドリングの設定
      this.setupErrorHandling();
      
      // MessageBridgeの初期化
      await this.initializeMessageBridge();
      
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * ミドルウェアの設定
   */
  setupMiddleware() {
    // セキュリティミドルウェア
    this.app.use(securityMiddleware());
    
    // リクエストログミドルウェア
    this.app.use(requestLogger);
    
    // JSONパーサー
    this.app.use(express.json({ limit: '10mb' }));
    
    // URLエンコードパーサー
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 静的ファイルの提供
    this.app.use('/static', express.static(path.join(__dirname, '../public')));
    
    // 一時ファイルの提供（スタンプ変換用）
    this.app.use('/temp', express.static(path.join(__dirname, '../temp')));
    
    logger.info('Middleware configured');
  }

  /**
   * ルートの設定
   */
  setupRoutes() {
    // ヘルスチェック
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // メトリクス
    this.app.get('/metrics', (req, res) => {
      if (!this.messageBridge) {
        return res.status(503).json({ error: 'MessageBridge not initialized' });
      }
      
      const metrics = this.messageBridge.getMetrics();
      res.json(metrics);
    });

    // LINE Webhook
    this.app.post(config.line.webhookPath, async (req, res) => {
      try {
        if (!this.messageBridge) {
          return res.status(503).json({ error: 'MessageBridge not initialized' });
        }

        const events = req.body.events;
        if (!events || !Array.isArray(events)) {
          return res.status(400).json({ error: 'Invalid webhook data' });
        }

        // イベントを処理
        for (const event of events) {
          await this.messageBridge.handleLineEvent(event);
        }

        res.json({ success: true });
      } catch (error) {
        logger.error('Webhook processing failed', {
          error: error.message,
          body: req.body
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ファイルアップロード
    this.app.post('/upload', async (req, res) => {
      try {
        if (!this.messageBridge) {
          return res.status(503).json({ error: 'MessageBridge not initialized' });
        }

        const result = await this.messageBridge.handleFileUpload(req);
        res.json(result);
      } catch (error) {
        logger.error('File upload failed', {
          error: error.message
        });
        res.status(500).json({ error: 'File upload failed' });
      }
    });

    // API情報
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'LINE-Discord Bridge',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Bidirectional messaging bridge between LINE and Discord',
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          webhook: config.line.webhookPath,
          upload: '/upload',
          info: '/api/info'
        }
      });
    });

    logger.info('Routes configured');
  }

  /**
   * エラーハンドリングの設定
   */
  setupErrorHandling() {
    // 404ハンドラー
    this.app.use(notFoundHandler);
    
    // エラーハンドラー
    this.app.use(errorHandler);
    
    logger.info('Error handling configured');
  }

  /**
   * MessageBridgeの初期化
   */
  async initializeMessageBridge() {
    try {
      this.messageBridge = new MessageBridge();
      await this.messageBridge.start();
      
      logger.info('MessageBridge started successfully');
    } catch (error) {
      logger.error('Failed to start MessageBridge', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * サーバーの開始
   */
  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(config.server.port, config.server.host, () => {
        logger.info('Server started', {
          port: config.server.port,
          host: config.server.host,
          environment: config.server.environment
        });
      });

      // グレースフルシャットダウンの設定
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('Failed to start server', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * グレースフルシャットダウンの設定
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        // 新しいリクエストの受け入れを停止
        if (this.server) {
          this.server.close(() => {
            logger.info('HTTP server closed');
          });
        }
        
        // MessageBridgeを停止
        if (this.messageBridge) {
          await this.messageBridge.stop();
          logger.info('MessageBridge stopped');
        }
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error.message
        });
        process.exit(1);
      }
    };

    // シグナルハンドラーの設定
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // 未処理の例外とリジェクトをキャッチ
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', {
        reason: reason,
        promise: promise
      });
      shutdown('unhandledRejection');
    });
  }

  /**
   * サーバーの停止
   */
  async stop() {
    try {
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      if (this.messageBridge) {
        await this.messageBridge.stop();
      }
      
      logger.info('Application stopped');
    } catch (error) {
      logger.error('Error stopping application', {
        error: error.message
      });
      throw error;
    }
  }
}

// アプリケーションの開始
if (require.main === module) {
  const app = new App();
  app.start().catch((error) => {
    logger.error('Failed to start application', {
      error: error.message
    });
    process.exit(1);
  });
}

module.exports = App;