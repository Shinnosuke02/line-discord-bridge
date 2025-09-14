/**
 * リプライ機能統合テスト
 * 
 * メッセージマッピングとリプライ機能の統合テスト
 * 
 * @version 3.1.0
 * @since 2024-12-19
 */
const MessageMappingManager = require('../../services/MessageMappingManager');
const SafeReplyService = require('../../services/SafeReplyService');

// モックの設定
jest.mock('../../utils/logger');

describe('Reply Integration Tests', () => {
  let messageMappingManager;
  let replyService;
  let mockLineService;
  let mockDiscordClient;

  beforeEach(() => {
    // モックの初期化
    mockLineService = {
      pushMessage: jest.fn()
    };

    mockDiscordClient = {
      channels: {
        fetch: jest.fn()
      }
    };

    messageMappingManager = new MessageMappingManager();
    replyService = new SafeReplyService(
      messageMappingManager,
      mockLineService,
      mockDiscordClient
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('メッセージマッピング', () => {
    test('LINEからDiscordへのマッピングが正常に作成される', async () => {
      const lineMessageId = 'line123';
      const discordMessageId = 'discord123';
      const lineUserId = 'user123';
      const discordChannelId = 'channel123';
      const content = 'テストメッセージ';

      await messageMappingManager.mapLineToDiscord(
        lineMessageId,
        discordMessageId,
        lineUserId,
        discordChannelId,
        content
      );

      const mapping = messageMappingManager.getLineToDiscordMapping(lineMessageId);
      expect(mapping).toBeDefined();
      expect(mapping.lineMessageId).toBe(lineMessageId);
      expect(mapping.discordMessageId).toBe(discordMessageId);
      expect(mapping.content).toBe(content);
    });

    test('DiscordからLINEへのマッピングが正常に作成される', async () => {
      const discordMessageId = 'discord123';
      const lineMessageId = 'line123';
      const lineUserId = 'user123';
      const discordChannelId = 'channel123';
      const content = 'Discordメッセージ';

      await messageMappingManager.mapDiscordToLine(
        discordMessageId,
        lineMessageId,
        lineUserId,
        discordChannelId,
        content
      );

      const mapping = messageMappingManager.getDiscordToLineMapping(discordMessageId);
      expect(mapping).toBeDefined();
      expect(mapping.discordMessageId).toBe(discordMessageId);
      expect(mapping.lineMessageId).toBe(lineMessageId);
      expect(mapping.content).toBe(content);
    });
  });

  describe('リプライ機能統合', () => {
    test('DiscordリプライがLINEに正常に転送される', async () => {
      // 事前にマッピングを作成
      await messageMappingManager.mapDiscordToLine(
        'originalDiscord123',
        'originalLine123',
        'user123',
        'channel123',
        '元のメッセージ'
      );

      const discordReplyMessage = {
        id: 'replyDiscord123',
        reference: { messageId: 'originalDiscord123' },
        content: '返信メッセージ',
        author: { username: 'testuser' }
      };

      await replyService.handleDiscordReply(discordReplyMessage, 'user123');

      expect(mockLineService.pushMessage).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('↩️ 返信')
        })
      );
    });

    test('LINEリプライがDiscordに正常に転送される', async () => {
      // 事前にマッピングを作成
      await messageMappingManager.mapLineToDiscord(
        'originalLine123',
        'originalDiscord123',
        'user123',
        'channel123',
        '元のメッセージ'
      );

      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue({
            reply: jest.fn()
          })
        }
      };

      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const lineReplyEvent = {
        type: 'message',
        message: {
          id: 'replyLine123',
          type: 'text',
          text: '↩️ 返信: 元のメッセージ [ID:originalLine123]'
        }
      };

      await replyService.handleLineReply(lineReplyEvent, 'channel123');

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('originalDiscord123');
    });

    test('マッピングが見つからない場合は処理をスキップする', async () => {
      const discordReplyMessage = {
        id: 'replyDiscord123',
        reference: { messageId: 'nonexistentDiscord123' },
        content: '返信メッセージ',
        author: { username: 'testuser' }
      };

      await replyService.handleDiscordReply(discordReplyMessage, 'user123');

      // マッピングが見つからないため、LINEに送信されない
      expect(mockLineService.pushMessage).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    test('リプライ処理のエラーが通常のメッセージ転送に影響しない', async () => {
      // エラーを発生させる
      mockLineService.pushMessage.mockRejectedValue(new Error('LINE API Error'));

      await messageMappingManager.mapDiscordToLine(
        'originalDiscord123',
        'originalLine123',
        'user123',
        'channel123',
        '元のメッセージ'
      );

      const discordReplyMessage = {
        id: 'replyDiscord123',
        reference: { messageId: 'originalDiscord123' },
        content: '返信メッセージ',
        author: { username: 'testuser' }
      };

      // エラーが発生しても例外がスローされない（安全モード）
      await expect(replyService.handleDiscordReply(discordReplyMessage, 'user123'))
        .resolves.not.toThrow();

      // 失敗統計が増加することを確認
      const stats = replyService.getReplyStats();
      expect(stats.failed).toBe(1);
    });
  });

  describe('統計・監視', () => {
    test('リプライ統計が正しく更新される', async () => {
      await messageMappingManager.mapDiscordToLine(
        'originalDiscord123',
        'originalLine123',
        'user123',
        'channel123',
        '元のメッセージ'
      );

      const discordReplyMessage = {
        id: 'replyDiscord123',
        reference: { messageId: 'originalDiscord123' },
        content: '返信メッセージ',
        author: { username: 'testuser' }
      };

      await replyService.handleDiscordReply(discordReplyMessage, 'user123');

      const stats = replyService.getReplyStats();
      expect(stats.discordToLine).toBe(1);
      expect(stats.totalReplies).toBe(1);
    });
  });
});
