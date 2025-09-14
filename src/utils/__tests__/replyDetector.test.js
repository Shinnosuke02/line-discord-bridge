/**
 * replyDetector テストファイル
 * 
 * リプライ検出ユーティリティのテストケースを定義
 * - LINEリプライ検出テスト
 * - Discordリプライ検出テスト
 * - メッセージID抽出テスト
 * - フォーマッターテスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const { LineReplyDetector, DiscordReplyDetector, ReplyFormatter } = require('../replyDetector');

describe('replyDetector', () => {
  describe('LineReplyDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new LineReplyDetector();
    });

    describe('isReplyMessage', () => {
      test('↩️ 返信パターンを検出する', () => {
        expect(detector.isReplyMessage('↩️ 返信: テストメッセージ')).toBe(true);
        expect(detector.isReplyMessage('↩️返信:テストメッセージ')).toBe(true);
      });

      test('💬 返信パターンを検出する', () => {
        expect(detector.isReplyMessage('💬 返信: テストメッセージ')).toBe(true);
      });

      test('返信:パターンを検出する', () => {
        expect(detector.isReplyMessage('返信: テストメッセージ')).toBe(true);
      });

      test('reply:パターンを検出する', () => {
        expect(detector.isReplyMessage('reply: テストメッセージ')).toBe(true);
        expect(detector.isReplyMessage('REPLY: テストメッセージ')).toBe(true);
      });

      test('通常のメッセージを検出しない', () => {
        expect(detector.isReplyMessage('通常のメッセージ')).toBe(false);
        expect(detector.isReplyMessage('Hello World')).toBe(false);
        expect(detector.isReplyMessage('')).toBe(false);
      });
    });

    describe('extractOriginalMessageId', () => {
      test('ID:パターンからメッセージIDを抽出する', () => {
        const messageId = detector.extractOriginalMessageId('↩️ 返信: テスト [ID:msg123]');
        expect(messageId).toBe('msg123');
      });

      test('MsgID:パターンからメッセージIDを抽出する', () => {
        const messageId = detector.extractOriginalMessageId('返信: テスト [MsgID:abc123]');
        expect(messageId).toBe('abc123');
      });

      test('MID:パターンからメッセージIDを抽出する', () => {
        const messageId = detector.extractOriginalMessageId('💬 返信: テスト [MID:xyz789]');
        expect(messageId).toBe('xyz789');
      });

      test('メッセージIDが見つからない場合はnullを返す', () => {
        const messageId = detector.extractOriginalMessageId('返信: テストメッセージ');
        expect(messageId).toBeNull();
      });
    });

    describe('extractReplyContent', () => {
      test('返信内容を抽出する', () => {
        const content = detector.extractReplyContent('↩️ 返信: テストメッセージ [ID:msg123]');
        expect(content).toBe('テストメッセージ');
      });

      test('メッセージIDを含まない返信内容を抽出する', () => {
        const content = detector.extractReplyContent('返信: こんにちは');
        expect(content).toBe('こんにちは');
      });
    });

    describe('parseReplyMessage', () => {
      test('返信メッセージを完全に解析する', () => {
        const result = detector.parseReplyMessage('↩️ 返信: テストメッセージ [ID:msg123]');
        
        expect(result).toEqual({
          isReply: true,
          originalMessageId: 'msg123',
          replyContent: 'テストメッセージ',
          fullText: '↩️ 返信: テストメッセージ [ID:msg123]'
        });
      });

      test('返信でないメッセージはnullを返す', () => {
        const result = detector.parseReplyMessage('通常のメッセージ');
        expect(result).toBeNull();
      });
    });
  });

  describe('DiscordReplyDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new DiscordReplyDetector();
    });

    describe('isReplyMessage', () => {
      test('Discordのネイティブリプライを検出する', () => {
        const message = {
          reference: { messageId: '123456789' },
          content: 'テストメッセージ'
        };
        expect(detector.isReplyMessage(message)).toBe(true);
      });

      test('リプライでないメッセージを検出しない', () => {
        const message = {
          content: '通常のメッセージ'
        };
        expect(detector.isReplyMessage(message)).toBe(false);
      });
    });

    describe('getReplyInfo', () => {
      test('リプライ情報を取得する', () => {
        const message = {
          reference: { messageId: '123456789' },
          content: 'テストメッセージ',
          author: { username: 'testuser' },
          createdAt: new Date()
        };
        
        const result = detector.getReplyInfo(message);
        
        expect(result).toEqual({
          isReply: true,
          referenceMessageId: '123456789',
          replyContent: 'テストメッセージ',
          author: { username: 'testuser' },
          timestamp: message.createdAt
        });
      });
    });
  });

  describe('ReplyFormatter', () => {
    let formatter;

    beforeEach(() => {
      formatter = new ReplyFormatter();
    });

    describe('formatDiscordReplyForLine', () => {
      test('DiscordリプライをLINE形式にフォーマットする', () => {
        const replyInfo = {
          author: { username: 'testuser' },
          replyContent: '返信メッセージ'
        };
        
        const result = formatter.formatDiscordReplyForLine(replyInfo, '元のメッセージ');
        
        expect(result).toBe('↩️ 返信: 元のメッセージ\n\ntestuser: 返信メッセージ');
      });
    });

    describe('formatLineReplyForDiscord', () => {
      test('LINEリプライをDiscord形式にフォーマットする', () => {
        const replyInfo = {
          replyContent: '返信メッセージ'
        };
        
        const result = formatter.formatLineReplyForDiscord(replyInfo, '元のメッセージ');
        
        expect(result).toBe('💬 返信: 元のメッセージ\n\n返信メッセージ');
      });
    });

    describe('embedMessageId', () => {
      test('メッセージIDを埋め込む', () => {
        const result = formatter.embedMessageId('テストメッセージ', 'msg123');
        expect(result).toBe('テストメッセージ [ID:msg123]');
      });
    });
  });
});
