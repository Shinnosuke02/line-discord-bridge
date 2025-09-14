/**
 * EnhancedReplyService テストファイル
 * 
 * 強化された返信サービスのテストケースを定義
 * - Discord→LINE返信テスト
 * - LINE→Discord返信テスト
 * - 統計機能テスト
 * - ヘルスチェックテスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const EnhancedReplyService = require('../EnhancedReplyService');
const { LineReplyDetector, DiscordReplyDetector, ReplyFormatter } = require('../../utils/replyDetector');

// モックの設定
jest.mock('../../utils/logger');

describe('EnhancedReplyService', () => {
  let replyService;
  let mockMessageMappingManager;
  let mockLineService;
  let mockDiscordClient;

  beforeEach(() => {
    // モックの初期化
    mockMessageMappingManager = {
      getLineMessageIdForDiscordReply: jest.fn(),
      getDiscordMessageIdForLineReply: jest.fn(),
      getDiscordToLineMapping: jest.fn(),
      getLineToDiscordMapping: jest.fn()
    };

    mockLineService = {
      pushMessage: jest.fn()
    };

    mockDiscordClient = {
      channels: {
        fetch: jest.fn()
      }
    };

    replyService = new EnhancedReplyService(
      mockMessageMappingManager,
      mockLineService,
      mockDiscordClient
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初期化', () => {
    test('EnhancedReplyServiceが正常に初期化される', () => {
      expect(replyService).toBeDefined();
      expect(replyService.lineReplyDetector).toBeInstanceOf(LineReplyDetector);
      expect(replyService.discordReplyDetector).toBeInstanceOf(DiscordReplyDetector);
      expect(replyService.replyFormatter).toBeInstanceOf(ReplyFormatter);
    });

    test('統計が初期化される', () => {
      const stats = replyService.getReplyStats();
      expect(stats.discordToLine).toBe(0);
      expect(stats.lineToDiscord).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('handleDiscordReply', () => {
    test('Discordリプライを正常に処理する', async () => {
      const message = {
        id: 'reply123',
        reference: { messageId: 'original123' },
        content: '返信メッセージ',
        author: { username: 'testuser' }
      };

      mockMessageMappingManager.getLineMessageIdForDiscordReply.mockReturnValue('line123');

      await replyService.handleDiscordReply(message, 'lineUser123');

      expect(mockLineService.pushMessage).toHaveBeenCalledWith(
        'lineUser123',
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('↩️ 返信')
        })
      );
    });

    test('リプライでないメッセージは処理しない', async () => {
      const message = {
        id: 'normal123',
        content: '通常のメッセージ'
      };

      await replyService.handleDiscordReply(message, 'lineUser123');

      expect(mockLineService.pushMessage).not.toHaveBeenCalled();
    });

    test('LINEメッセージが見つからない場合は処理しない', async () => {
      const message = {
        id: 'reply123',
        reference: { messageId: 'original123' },
        content: '返信メッセージ'
      };

      mockMessageMappingManager.getLineMessageIdForDiscordReply.mockReturnValue(null);

      await replyService.handleDiscordReply(message, 'lineUser123');

      expect(mockLineService.pushMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleLineReply', () => {
    test('LINEリプライを正常に処理する', async () => {
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

      await replyService.handleLineReply(event, 'discordChannel123');

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('discord123');
    });

    test('リプライでないメッセージは処理しない', async () => {
      const event = {
        type: 'message',
        message: {
          id: 'normal123',
          type: 'text',
          text: '通常のメッセージ'
        }
      };

      await replyService.handleLineReply(event, 'discordChannel123');

      expect(mockDiscordClient.channels.fetch).not.toHaveBeenCalled();
    });

    test('テキスト以外のメッセージは処理しない', async () => {
      const event = {
        type: 'message',
        message: {
          id: 'image123',
          type: 'image'
        }
      };

      await replyService.handleLineReply(event, 'discordChannel123');

      expect(mockDiscordClient.channels.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getReplyStats', () => {
    test('統計情報を正しく取得する', () => {
      // 統計を増加
      replyService.replyStats.discordToLine = 5;
      replyService.replyStats.lineToDiscord = 3;
      replyService.replyStats.failed = 1;

      const stats = replyService.getReplyStats();

      expect(stats.discordToLine).toBe(5);
      expect(stats.lineToDiscord).toBe(3);
      expect(stats.failed).toBe(1);
      expect(stats.totalReplies).toBe(8);
      expect(stats.successRate).toBe(8 / 9); // 8/(8+1)
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe('resetStats', () => {
    test('統計をリセットする', () => {
      // 統計を設定
      replyService.replyStats.discordToLine = 5;
      replyService.replyStats.lineToDiscord = 3;
      replyService.replyStats.failed = 1;

      replyService.resetStats();

      const stats = replyService.getReplyStats();
      expect(stats.discordToLine).toBe(0);
      expect(stats.lineToDiscord).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('healthCheck', () => {
    test('ヘルスチェックが正常に動作する', async () => {
      const health = await replyService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.lineReplyDetector).toBe(true);
      expect(health.discordReplyDetector).toBe(true);
      expect(health.messageMappingManager).toBe(true);
      expect(health.lineService).toBe(true);
      expect(health.discordClient).toBe(true);
      expect(health.stats).toBeDefined();
    });
  });

  describe('getOriginalMessageContent', () => {
    test('Discordメッセージの内容を取得する', async () => {
      mockMessageMappingManager.getDiscordToLineMapping.mockReturnValue({
        content: '元のメッセージ内容'
      });

      const content = await replyService.getOriginalMessageContent('discord123', 'discord');

      expect(content).toBe('元のメッセージ内容');
    });

    test('LINEメッセージの内容を取得する', async () => {
      mockMessageMappingManager.getLineToDiscordMapping.mockReturnValue({
        content: '元のメッセージ内容'
      });

      const content = await replyService.getOriginalMessageContent('line123', 'line');

      expect(content).toBe('元のメッセージ内容');
    });

    test('メッセージが見つからない場合はnullを返す', async () => {
      mockMessageMappingManager.getDiscordToLineMapping.mockReturnValue(null);

      const content = await replyService.getOriginalMessageContent('unknown123', 'discord');

      expect(content).toBeNull();
    });
  });
});
