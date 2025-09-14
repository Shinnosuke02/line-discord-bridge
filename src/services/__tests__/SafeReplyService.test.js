/**
 * SafeReplyService テストファイル
 * 
 * 安全な返信サービスのテストケースを定義
 * - エラー処理テスト
 * - タイムアウトテスト
 * - フォールバック機能テスト
 * - 安全モードテスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const SafeReplyService = require('../SafeReplyService');

// モックの設定
jest.mock('../../utils/logger');

describe('SafeReplyService', () => {
  let safeReplyService;
  let mockMessageMappingManager;
  let mockLineService;
  let mockDiscordClient;

  beforeEach(() => {
    // モックの初期化
    mockMessageMappingManager = {
      getLineMessageIdForDiscordReply: jest.fn(),
      getDiscordMessageIdForLineReply: jest.fn()
    };

    mockLineService = {
      pushMessage: jest.fn()
    };

    mockDiscordClient = {
      channels: {
        fetch: jest.fn()
      }
    };

    safeReplyService = new SafeReplyService(
      mockMessageMappingManager,
      mockLineService,
      mockDiscordClient
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初期化', () => {
    test('SafeReplyServiceが正常に初期化される', () => {
      expect(safeReplyService).toBeDefined();
      expect(safeReplyService.safeMode).toBe(true);
      expect(safeReplyService.maxRetries).toBe(3);
      expect(safeReplyService.timeoutMs).toBe(5000);
    });
  });

  describe('handleDiscordReply - 安全モード', () => {
    test('リプライ処理が成功する場合', async () => {
      const message = {
        id: 'reply123',
        reference: { messageId: 'original123' },
        content: '返信メッセージ',
        author: { username: 'testuser' }
      };

      mockMessageMappingManager.getLineMessageIdForDiscordReply.mockReturnValue('line123');

      // 例外がスローされないことを確認
      await expect(safeReplyService.handleDiscordReply(message, 'lineUser123'))
        .resolves.not.toThrow();

      expect(mockLineService.pushMessage).toHaveBeenCalled();
    });

    test('リプライ処理が失敗しても例外をスローしない（安全モード）', async () => {
      const message = {
        id: 'reply123',
        reference: { messageId: 'original123' },
        content: '返信メッセージ'
      };

      // エラーを発生させる
      mockMessageMappingManager.getLineMessageIdForDiscordReply.mockImplementation(() => {
        throw new Error('Mapping error');
      });

      // 安全モードでは例外がスローされない
      await expect(safeReplyService.handleDiscordReply(message, 'lineUser123'))
        .resolves.not.toThrow();

      // 失敗統計が増加することを確認
      expect(safeReplyService.replyStats.failed).toBe(1);
    });

    test('タイムアウトが発生しても例外をスローしない', async () => {
      const message = {
        id: 'reply123',
        reference: { messageId: 'original123' },
        content: '返信メッセージ'
      };

      // タイムアウトを短く設定
      safeReplyService.setTimeout(1);

      // 遅延を発生させる
      mockMessageMappingManager.getLineMessageIdForDiscordReply.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 100));
      });

      // タイムアウトが発生しても例外がスローされない
      await expect(safeReplyService.handleDiscordReply(message, 'lineUser123'))
        .resolves.not.toThrow();

      // 失敗統計が増加することを確認
      expect(safeReplyService.replyStats.failed).toBe(1);
    });
  });

  describe('handleLineReply - 安全モード', () => {
    test('リプライ処理が成功する場合', async () => {
      const event = {
        type: 'message',
        message: {
          id: 'lineReply123',
          type: 'text',
          text: '↩️ 返信: テストメッセージ [ID:discord123]'
        }
      };

      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue({
            reply: jest.fn()
          })
        }
      };

      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);
      mockMessageMappingManager.getDiscordMessageIdForLineReply.mockReturnValue('discord123');

      // 例外がスローされないことを確認
      await expect(safeReplyService.handleLineReply(event, 'discordChannel123'))
        .resolves.not.toThrow();

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('discord123');
    });

    test('リプライ処理が失敗しても例外をスローしない', async () => {
      const event = {
        type: 'message',
        message: {
          id: 'lineReply123',
          type: 'text',
          text: '↩️ 返信: テストメッセージ [ID:discord123]'
        }
      };

      // エラーを発生させる
      mockMessageMappingManager.getDiscordMessageIdForLineReply.mockImplementation(() => {
        throw new Error('Mapping error');
      });

      // 安全モードでは例外がスローされない
      await expect(safeReplyService.handleLineReply(event, 'discordChannel123'))
        .resolves.not.toThrow();

      // 失敗統計が増加することを確認
      expect(safeReplyService.replyStats.failed).toBe(1);
    });
  });

  describe('安全モードの切り替え', () => {
    test('安全モードを無効にできる', () => {
      safeReplyService.setSafeMode(false);
      expect(safeReplyService.safeMode).toBe(false);
    });

    test('安全モードを有効にできる', () => {
      safeReplyService.setSafeMode(true);
      expect(safeReplyService.safeMode).toBe(true);
    });
  });

  describe('タイムアウト設定', () => {
    test('タイムアウト時間を設定できる', () => {
      safeReplyService.setTimeout(10000);
      expect(safeReplyService.timeoutMs).toBe(10000);
    });
  });

  describe('ヘルスチェック', () => {
    test('ヘルスチェックが正常に動作する', async () => {
      const health = await safeReplyService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.safeMode).toBe(true);
      expect(health.timeoutMs).toBe(5000);
      expect(health.safetyFeatures).toEqual({
        timeoutProtection: true,
        errorIsolation: true,
        gracefulDegradation: true
      });
    });
  });

  describe('安全統計', () => {
    test('安全統計を正しく取得する', () => {
      // 統計を設定
      safeReplyService.replyStats.discordToLine = 5;
      safeReplyService.replyStats.lineToDiscord = 3;
      safeReplyService.replyStats.failed = 2;

      const stats = safeReplyService.getSafetyStats();

      expect(stats.discordToLine).toBe(5);
      expect(stats.lineToDiscord).toBe(3);
      expect(stats.failed).toBe(2);
      expect(stats.errorRate).toBe(2 / 10); // 2/(5+3+2)
      expect(stats.reliability).toBe(8 / 10); // (5+3)/(5+3+2)
      expect(stats.safetyMode).toBe(true);
      expect(stats.timeoutMs).toBe(5000);
    });
  });

  describe('withTimeout', () => {
    test('正常に実行される関数は結果を返す', async () => {
      const result = await safeReplyService.withTimeout(
        () => Promise.resolve('success'),
        1000
      );

      expect(result).toBe('success');
    });

    test('タイムアウトが発生する', async () => {
      await expect(
        safeReplyService.withTimeout(
          () => new Promise(resolve => setTimeout(() => resolve('delayed'), 100)),
          10
        )
      ).rejects.toThrow('Reply processing timeout after 10ms');
    });

    test('エラーが発生する関数は例外をスローする', async () => {
      await expect(
        safeReplyService.withTimeout(
          () => Promise.reject(new Error('Test error')),
          1000
        )
      ).rejects.toThrow('Test error');
    });
  });
});
