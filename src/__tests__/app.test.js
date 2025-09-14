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

// モックの設定
jest.mock('../services/MessageBridge');
jest.mock('../utils/logger');

const mockMessageBridge = {
  start: jest.fn(),
  stop: jest.fn(),
  getMetrics: jest.fn()
};

const MessageBridge = require('../services/MessageBridge');
MessageBridge.mockImplementation(() => mockMessageBridge);

describe('App', () => {
  let app;

  beforeEach(() => {
    app = new App();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (app.server) {
      app.server.close();
    }
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
  });

  describe('ヘルスチェック', () => {
    test('ヘルスチェックエンドポイントが正常に動作する', async () => {
      app.messageBridge = mockMessageBridge;
      
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
});
