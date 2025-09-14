/**
 * LineService テストファイル
 * 
 * LINE Bot APIサービスのテストケースを定義
 * - 初期化テスト
 * - メッセージ送信テスト
 * - プロフィール取得テスト
 * - エラーハンドリングテスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const LineService = require('../LineService');

// モックの設定
jest.mock('@line/bot-sdk', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pushMessage: jest.fn(),
    replyMessage: jest.fn(),
    getProfile: jest.fn(),
    getGroupSummary: jest.fn()
  }))
}));

jest.mock('../../utils/logger');

describe('LineService', () => {
  let lineService;

  beforeEach(() => {
    lineService = new LineService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初期化', () => {
    test('LineServiceが正常に初期化される', () => {
      expect(lineService).toBeDefined();
      expect(lineService.client).toBeDefined();
    });
  });

  describe('メッセージ送信', () => {
    test('pushMessageが正常に動作する', async () => {
      const userId = 'test-user';
      const message = { type: 'text', text: 'test message' };
      
      lineService.client.pushMessage.mockResolvedValue({});

      const result = await lineService.pushMessage(userId, message);
      
      expect(lineService.client.pushMessage).toHaveBeenCalledWith(userId, [message]);
      expect(result).toBeDefined();
    });

    test('replyMessageが正常に動作する', async () => {
      const replyToken = 'test-token';
      const message = { type: 'text', text: 'test reply' };
      
      lineService.client.replyMessage.mockResolvedValue({});

      const result = await lineService.replyMessage(replyToken, message);
      
      expect(lineService.client.replyMessage).toHaveBeenCalledWith(replyToken, [message]);
      expect(result).toBeDefined();
    });
  });

  describe('プロフィール取得', () => {
    test('getProfileが正常に動作する', async () => {
      const userId = 'test-user';
      const mockProfile = { displayName: 'Test User' };
      
      lineService.client.getProfile.mockResolvedValue(mockProfile);

      const result = await lineService.getProfile(userId);
      
      expect(lineService.client.getProfile).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockProfile);
    });
  });

  describe('エラーハンドリング', () => {
    test('API呼び出しエラーが適切に処理される', async () => {
      const error = new Error('API Error');
      lineService.client.pushMessage.mockRejectedValue(error);

      await expect(lineService.pushMessage('test-user', 'test message'))
        .rejects.toThrow('API Error');
    });
  });
});
