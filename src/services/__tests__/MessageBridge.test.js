/**
 * MessageBridge テストファイル
 * 
 * メッセージブリッジサービスのテストケースを定義
 * - 初期化テスト
 * - エラーハンドリングテスト
 * - メトリクス取得テスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const MessageBridge = require('../MessageBridge');
const LineService = require('../LineService');
const DiscordService = require('../DiscordService');

// モックの設定
jest.mock('../LineService');
jest.mock('../DiscordService');
jest.mock('../../utils/logger');

describe('MessageBridge', () => {
  let messageBridge;
  let mockLineService;
  let mockDiscordService;

  beforeEach(() => {
    // モックの初期化
    mockLineService = {
      pushMessage: jest.fn(),
      replyMessage: jest.fn(),
      getProfile: jest.fn(),
      getGroupSummary: jest.fn()
    };
    
    mockDiscordService = {
      sendMessage: jest.fn(),
      setClient: jest.fn()
    };

    LineService.mockImplementation(() => mockLineService);
    DiscordService.mockImplementation(() => mockDiscordService);

    messageBridge = new MessageBridge();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初期化', () => {
    test('MessageBridgeが正常に初期化される', () => {
      expect(messageBridge).toBeDefined();
      expect(messageBridge.isInitialized).toBe(false);
    });

    test('メトリクスが初期化される', () => {
      expect(messageBridge.metrics).toBeDefined();
      expect(messageBridge.metrics.messagesProcessed).toBe(0);
      expect(messageBridge.metrics.errors).toBe(0);
      expect(messageBridge.metrics.startTime).toBeDefined();
    });
  });

  describe('エラーハンドリング', () => {
    test('LINEメッセージ送信エラーが適切に処理される', async () => {
      const error = new Error('LINE API Error');
      mockLineService.pushMessage.mockRejectedValue(error);

      await expect(messageBridge.sendToLine('test-user', 'test message'))
        .rejects.toThrow('LINE API Error');
    });

    test('Discordメッセージ送信エラーが適切に処理される', async () => {
      const error = new Error('Discord API Error');
      mockDiscordService.sendMessage.mockRejectedValue(error);

      await expect(messageBridge.sendToDiscord('test-channel', 'test message'))
        .rejects.toThrow('Discord API Error');
    });
  });

  describe('メトリクス', () => {
    test('getMetricsが正しい値を返す', () => {
      const metrics = messageBridge.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.messagesProcessed).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.uptime).toBeDefined();
    });
  });
});
