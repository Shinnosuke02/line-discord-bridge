/**
 * アプリケーション テストファイル
 * 
 * メインアプリケーションのテストケースを定義
 * - 初期化テスト
 * - ミドルウェア設定テスト
 * - ルート設定テスト
 * - エラーハンドリングテスト
 * - ヘルスチェックテスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const App = require('../app');
const request = require('supertest');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const config = require('../config');
const { createLineSignature } = require('../middleware/lineSignature');

// モックの設定
jest.mock('../services/MessageBridge');
jest.mock('../utils/logger');

const mockMessageBridge = {
  start: jest.fn(),
  stop: jest.fn(),
  getMetrics: jest.fn(),
  handleLineEvent: jest.fn()
};

const MessageBridge = require('../services/MessageBridge');
MessageBridge.mockImplementation(() => mockMessageBridge);

describe('App', () => {
  let app;
  let processOnSpy;
  let originalTempPath;
  let originalTempStaticEnabled;

  beforeEach(() => {
    processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    originalTempPath = config.file.tempPath;
    originalTempStaticEnabled = config.file.tempStaticEnabled;
    app = new App();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (app.server) {
      app.server.close();
    }
    config.file.tempPath = originalTempPath;
    config.file.tempStaticEnabled = originalTempStaticEnabled;
    processOnSpy.mockRestore();
  });

  describe('初期化', () => {
    test('Appが正常に初期化される', () => {
      expect(app).toBeDefined();
      expect(app.app).toBeDefined();
      expect(app.messageBridge).toBe(null);
    });
  });

  describe('ミドルウェア設定', () => {
    test('setupMiddlewareが正常に動作する', () => {
      expect(() => app.setupMiddleware()).not.toThrow();
    });

    test('temp static serving can be disabled by config', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-temp-static-'));
      try {
        await fs.writeFile(path.join(tempDir, 'sample.txt'), 'hello');
        config.file.tempPath = tempDir;
        config.file.tempStaticEnabled = false;

        app.setupMiddleware();

        const response = await request(app.app).get('/temp/sample.txt');
        expect(response.status).toBe(404);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    test('temp static serving sets defensive headers when enabled', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-temp-static-'));
      try {
        await fs.writeFile(path.join(tempDir, 'sample.txt'), 'hello');
        config.file.tempPath = tempDir;
        config.file.tempStaticEnabled = true;

        app.setupMiddleware();

        const response = await request(app.app).get('/temp/sample.txt');
        expect(response.status).toBe(200);
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['cache-control']).toContain('max-age=300');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('ルート設定', () => {
    test('setupRoutesが正常に動作する', () => {
      expect(() => app.setupRoutes()).not.toThrow();
    });
  });

  describe('エラーハンドリング', () => {
    test('setupErrorHandlingが正常に動作する', () => {
      expect(() => app.setupErrorHandling()).not.toThrow();
    });
  });

  describe('MessageBridge初期化', () => {
    test('initializeMessageBridgeが正常に動作する', async () => {
      mockMessageBridge.start.mockResolvedValue();

      await expect(app.initializeMessageBridge()).resolves.not.toThrow();
      expect(mockMessageBridge.start).toHaveBeenCalled();
    });

    test('MessageBridge初期化エラーが適切に処理される', async () => {
      const error = new Error('MessageBridge initialization failed');
      mockMessageBridge.start.mockRejectedValue(error);

      await expect(app.initializeMessageBridge()).rejects.toThrow(error);
    });
  });

  describe('グレースフルシャットダウン', () => {
    test('setupGracefulShutdownが正常に動作する', () => {
      expect(() => app.setupGracefulShutdown()).not.toThrow();
    });

    test('setupGracefulShutdownはシグナルハンドラを重複登録しない', () => {
      app.setupGracefulShutdown();
      const firstCallCount = processOnSpy.mock.calls.length;

      app.setupGracefulShutdown();

      expect(processOnSpy).toHaveBeenCalledTimes(firstCallCount);
      expect(app.shutdownHandlersRegistered).toBe(true);
    });
  });

  describe('ヘルスチェック', () => {
    test('ヘルスチェックエンドポイントが正常に動作する', async () => {
      app.messageBridge = mockMessageBridge;
      app.setupRoutes();
      
      const req = {};
      const res = {
        json: jest.fn()
      };

      // ヘルスチェックルートを直接テスト
      const healthRoute = app.app._router.stack.find(layer => 
        layer.route && layer.route.path === '/health'
      );
      
      if (healthRoute) {
        const handler = healthRoute.route.stack[0].handle;
        handler(req, res);
        
        expect(res.json).toHaveBeenCalledWith({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: expect.any(String)
        });
      }
    });
  });

  describe('LINE Webhook署名検証', () => {
    test('正しい署名のWebhookを処理する', async () => {
      app.messageBridge = mockMessageBridge;
      app.setupMiddleware();
      app.setupRoutes();

      const body = {
        events: [
          {
            type: 'message',
            message: {
              id: 'line-message-1',
              type: 'text',
              text: 'hello'
            },
            source: {
              userId: 'line-user-1'
            }
          }
        ]
      };
      const rawBody = JSON.stringify(body);
      const signature = createLineSignature(rawBody, config.line.channelSecret);

      const response = await request(app.app)
        .post(config.line.webhookPath)
        .set('content-type', 'application/json')
        .set('x-line-signature', signature)
        .send(rawBody);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockMessageBridge.handleLineEvent).toHaveBeenCalledWith(body.events[0]);
    });

    test('不正な署名のWebhookを拒否する', async () => {
      app.messageBridge = mockMessageBridge;
      app.setupMiddleware();
      app.setupRoutes();

      const response = await request(app.app)
        .post(config.line.webhookPath)
        .set('content-type', 'application/json')
        .set('x-line-signature', 'invalid-signature')
        .send(JSON.stringify({ events: [] }));

      expect(response.status).toBe(401);
      expect(mockMessageBridge.handleLineEvent).not.toHaveBeenCalled();
    });
  });
});
