/**
 * emojiHandler テストファイル
 * 
 * 絵文字処理ユーティリティのテストケースを定義
 * - Unicode正規化テスト
 * - 絵文字検証テスト
 * - LINE/Discord間の絵文字変換テスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const {
  normalizeEmojis,
  isValidEmoji,
  processEmojiText,
  processLineEmoji,
  processDiscordEmoji
} = require('../emojiHandler');

describe('emojiHandler', () => {
  describe('normalizeEmojis', () => {
    test('正常な絵文字を正規化する', () => {
      const input = 'Hello 😊 World';
      const result = normalizeEmojis(input);
      expect(result).toBe('Hello 😊 World');
    });

    test('ゼロ幅文字を削除する', () => {
      const input = 'Hello\u200B😊\uFEFFWorld';
      const result = normalizeEmojis(input);
      expect(result).toBe('Hello😊World');
    });

    test('空文字列を処理する', () => {
      const result = normalizeEmojis('');
      expect(result).toBe('');
    });

    test('nullを処理する', () => {
      const result = normalizeEmojis(null);
      expect(result).toBe(null);
    });
  });

  describe('isValidEmoji', () => {
    test('有効な絵文字を検出する', () => {
      expect(isValidEmoji('😊')).toBe(true);
      expect(isValidEmoji('🎉')).toBe(true);
      expect(isValidEmoji('🇯🇵')).toBe(true);
    });

    test('絵文字を含まないテキストを検出する', () => {
      expect(isValidEmoji('Hello World')).toBe(false);
      expect(isValidEmoji('123')).toBe(false);
      expect(isValidEmoji('')).toBe(false);
    });

    test('nullを処理する', () => {
      expect(isValidEmoji(null)).toBe(false);
    });
  });

  describe('processEmojiText', () => {
    test('正常な絵文字テキストを処理する', () => {
      const input = 'Hello 😊 World';
      const result = processEmojiText(input);
      expect(result).toBe('Hello 😊 World');
    });

    test('絵文字化けテキストを修正する', () => {
      const input = 'Hello (emoji) World';
      const result = processEmojiText(input);
      expect(result).toBe('Hello 😊 World');
    });

    test('複数の絵文字化けを修正する', () => {
      const input = 'Hello (emoji) World (emoji)';
      const result = processEmojiText(input);
      expect(result).toBe('Hello 😊 World 😊');
    });
  });

  describe('processLineEmoji', () => {
    test('LINE絵文字を処理する', () => {
      const input = 'LINEからの絵文字 😊';
      const result = processLineEmoji(input);
      expect(result).toBe('LINEからの絵文字 😊');
    });

    test('LINE絵文字化けを修正する', () => {
      const input = 'LINEからのメッセージ (emoji)';
      const result = processLineEmoji(input);
      expect(result).toBe('LINEからのメッセージ 😊');
    });
  });

  describe('processDiscordEmoji', () => {
    test('Discord絵文字を処理する', () => {
      const input = 'Discordからの絵文字 😊';
      const result = processDiscordEmoji(input);
      expect(result).toBe('Discordからの絵文字 😊');
    });

    test('Discordカスタム絵文字を処理する', () => {
      const input = 'カスタム絵文字 <:custom:123456789>';
      const result = processDiscordEmoji(input);
      expect(result).toBe('カスタム絵文字 😊');
    });

    test('Discord絵文字化けを修正する', () => {
      const input = 'Discordからのメッセージ (emoji)';
      const result = processDiscordEmoji(input);
      expect(result).toBe('Discordからのメッセージ 😊');
    });
  });

  describe('エラーハンドリング', () => {
    test('不正な文字列を処理する', () => {
      const input = '\uFFFE\uFFFF'; // 不正なUnicode文字
      const result = processEmojiText(input);
      expect(result).toBeDefined();
    });

    test('非常に長い文字列を処理する', () => {
      const input = '😊'.repeat(10000);
      const result = processEmojiText(input);
      expect(result).toBeDefined();
    });
  });
});
