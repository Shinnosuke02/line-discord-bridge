const express = require('express');
const { createServer } = require('http');
const { Client } = require('@line/bot-sdk');
const config = require('./config');
const logger = require('./utils/logger');
const ModernMessageBridge = require('./services/modernMessageBridge');
const InstagramService = require('./services/instagramService');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

/**
 * 近代化されたLINE-Discordブリッジアプリケーション
 * LINE Bot API v7対応、より堅牢なエラーハンドリング
 */
class ModernApp {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.lineClient = new Client(config.line);
    this.instagramService = new InstagramService();
    this.messageBridge = new ModernMessageBridge();
    
    // グレースフルシャットダウン用
    this.isShuttingDown = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  /**
   * ミドルウェアを設定
   */
  setupMiddleware() {
    // リクエストログ
    this.app.use((req, res, next) => {
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // JSONパーサー
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // セキュリティヘッダー
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  /**
   * ルートを設定
   */
  setupRoutes() {
    // ヘルスチェック
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0'
      });
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
        for (const event of req.body.events) {
          try {
            await this.handleLineEvent(event);
          } catch (error) {
            logger.error('Failed to handle LINE event', {
              eventId: event.message?.id,
              error: error.message,
              stack: error.stack
            });
          }
        }
        
        logger.info('LINE webhook processed successfully', { 
          eventCount: req.body.events?.length || 0 
        });
        res.status(200).json({ success: true });
        
      } catch (error) {
        logger.error('LINE webhook error', {
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Instagram Webhook
    this.app.post('/instagram-webhook', async (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ error: 'Service is shutting down' });
      }

      try {
        // Instagram Webhookチャレンジ処理
        if (req.body.object === 'instagram' && req.body.entry) {
          // Webhook署名を検証
          const signature = req.headers['x-hub-signature-256'];
          if (signature) {
            const rawBody = JSON.stringify(req.body);
            if (!this.instagramService.verifySignature(signature.replace('sha256=', ''), rawBody)) {
              logger.warn('Invalid Instagram signature');
              return res.status(400).json({ error: 'Invalid signature' });
            }
          }

          // エントリーを処理
          for (const entry of req.body.entry) {
            for (const change of entry.changes || []) {
              try {
                await this.handleInstagramEvent(change);
              } catch (error) {
                logger.error('Failed to handle Instagram event', {
                  error: error.message,
                  stack: error.stack
                });
              }
            }
          }
        }
        
        logger.info('Instagram webhook processed successfully');
        res.status(200).json({ success: true });
        
      } catch (error) {
        logger.error('Instagram webhook error', {
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Instagram Webhook検証
    this.app.get('/instagram-webhook', (req, res) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === config.instagram.verifyToken) {
        logger.info('Instagram webhook verification successful');
        res.status(200).send(challenge);
      } else {
        logger.warn('Instagram webhook verification failed');
        res.status(403).json({ error: 'Forbidden' });
      }
    });

    // Instagram データ削除リクエスト
    this.app.post('/instagram-delete', (req, res) => {
      logger.info('Instagram data deletion request received', {
        userId: req.body.user_id
      });
      res.status(200).json({ success: true });
    });

    // Instagram 認証解除
    this.app.post('/instagram-deauth', (req, res) => {
      logger.info('Instagram deauthorization request received', {
        userId: req.body.user_id
      });
      res.status(200).json({ success: true });
    });

    // アップロードAPI
    const upload = multer({ storage: multer.memoryStorage() });
    this.app.post('/upload', upload.single('file'), async (req, res) => {
      try {
        // 認証
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== process.env.UPLOAD_API_KEY) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
        const uploadDir = process.env.UPLOAD_DIR || '/var/www/uploads';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const mimeToExt = {
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/png': '.png',
          'image/webp': '.webp',
          'image/gif': '.gif',
        };
        let ext = mimeToExt[req.file.mimetype];
        if (!ext) {
          // ファイル名から拡張子を推定
          ext = path.extname(req.file.originalname).toLowerCase();
          if (!allowedImageExts.includes(ext)) {
            return res.status(400).json({ error: 'Unsupported file type' });
          }
        }
        let filename = uuidv4() + ext;
        let buffer = req.file.buffer;
        // 画像の場合は10MB超なら圧縮
        if (ext.startsWith('.') && ext.slice(1) === 'jpg' && buffer.length > Number(process.env.MAX_IMAGE_SIZE || 10485760)) {
          let quality = 80;
          let compressed;
          do {
            compressed = await sharp(buffer)
              .toFormat(ext.replace('.', ''))
              .jpeg({ quality })
              .toBuffer();
            quality -= 10;
          } while (compressed.length > Number(process.env.MAX_IMAGE_SIZE || 10485760) && quality > 10);
          buffer = compressed;
        }
        // 画像以外で10MB超はエラー
        if (!ext.startsWith('.') && buffer.length > Number(process.env.MAX_IMAGE_SIZE || 10485760)) {
          return res.status(400).json({ error: 'File too large (max 10MB)' });
        }
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);
        // 公開URL生成
        const publicBase = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const publicUrl = `${publicBase}/uploads/${filename}`;
        res.status(200).json({ url: publicUrl });
      } catch (error) {
        logger.error('Upload failed', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Upload failed' });
      }
    });

    // 404ハンドラー
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  /**
   * エラーハンドリングを設定
   */
  setupErrorHandling() {
    // グローバルエラーハンドラー
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({ error: 'Internal server error' });
    });

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
      
      // グレースフルシャットダウン
      this.shutdown();
    });
  }

  /**
   * グレースフルシャットダウンを設定
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
   * Instagramイベントを処理
   * @param {Object} change - Instagram変更イベント
   */
  async handleInstagramEvent(change) {
    try {
      // メッセージイベントのみ処理
      if (change.field !== 'messages') {
        logger.debug('Skipping non-message Instagram event', { field: change.field });
        return;
      }

      const value = change.value;
      if (!value || !value.messages || !Array.isArray(value.messages)) {
        logger.debug('No messages in Instagram event');
        return;
      }

      for (const message of value.messages) {
        try {
          logger.info('Processing Instagram message', {
            senderId: message.from?.id,
            messageType: message.type,
            timestamp: message.timestamp
          });

          // InstagramイベントをMessageBridgeに転送
          await this.messageBridge.handleInstagramToDiscord({
            sender: message.from,
            message: message,
            timestamp: message.timestamp
          });

        } catch (error) {
          logger.error('Failed to handle Instagram message', {
            messageId: message.id,
            error: error.message,
            stack: error.stack
          });
        }
      }

    } catch (error) {
      logger.error('Failed to handle Instagram event', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * LINEイベントを処理
   * @param {Object} event - LINEイベント
   */
  async handleLineEvent(event) {
    try {
      // メッセージイベントのみ処理
      if (event.type !== 'message') {
        logger.debug('Skipping non-message event', { eventType: event.type });
        return;
      }

      // ボット自身のメッセージは無視
      if (event.source.type === 'user' && event.source.userId === config.line.channelId) {
        logger.debug('Skipping bot message');
        return;
      }

      logger.info('Processing LINE event', {
        eventType: event.type,
        messageType: event.message?.type,
        sourceType: event.source.type,
        sourceId: event.source.groupId || event.source.userId,
        senderId: event.source.userId
      });

      // MessageBridgeに転送
      await this.messageBridge.handleLineToDiscord(event);

    } catch (error) {
      logger.error('Failed to handle LINE event', {
        eventId: event.message?.id,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * アプリケーションを開始
   */
  async start() {
    try {
      // MessageBridgeを開始
      await this.messageBridge.start();
      
      // HTTPサーバーを開始
      const port = process.env.PORT || 3000;
      await new Promise((resolve, reject) => {
        this.server.listen(port, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      logger.info('Modern LINE-Discord Bridge started successfully', {
        port,
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage()
      });

    } catch (error) {
      logger.error('Failed to start application', { error: error.message });
      throw error;
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
const app = new ModernApp();

// アプリケーションを開始
app.start().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});

module.exports = app; 