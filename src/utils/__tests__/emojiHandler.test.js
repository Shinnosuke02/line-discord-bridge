const {
  normalizeEmojis,
  isValidEmoji,
  processEmojiText,
  processLineEmoji,
  processDiscordEmoji,
  replaceLineEmojiPlaceholders
} = require('../emojiHandler');

jest.mock('../logger');

describe('emojiHandler', () => {
  describe('normalizeEmojis', () => {
    test('normalizes ordinary emoji text', () => {
      expect(normalizeEmojis('Hello 😊 World')).toBe('Hello 😊 World');
    });

    test('removes harmless zero-width separators', () => {
      expect(normalizeEmojis('Hello\u200B😊\uFEFFWorld')).toBe('Hello😊World');
    });

    test('preserves ZWJ and variation selectors used by emoji sequences', () => {
      expect(normalizeEmojis('👩‍💻 ❤️')).toBe('👩‍💻 ❤️');
    });

    test('handles empty and null values', () => {
      expect(normalizeEmojis('')).toBe('');
      expect(normalizeEmojis(null)).toBe(null);
    });
  });

  describe('isValidEmoji', () => {
    test('detects supported Unicode emoji', () => {
      expect(isValidEmoji('😊')).toBe(true);
      expect(isValidEmoji('🎉')).toBe(true);
      expect(isValidEmoji('🇯🇵')).toBe(true);
    });

    test('rejects text without emoji', () => {
      expect(isValidEmoji('Hello World')).toBe(false);
      expect(isValidEmoji('123')).toBe(false);
      expect(isValidEmoji('')).toBe(false);
      expect(isValidEmoji(null)).toBe(false);
    });
  });

  describe('processEmojiText', () => {
    test('keeps ordinary emoji intact', () => {
      expect(processEmojiText('Hello 😊 World')).toBe('Hello 😊 World');
    });

    test('retains the legacy generic emoji fallback', () => {
      expect(processEmojiText('Hello (emoji) World (emoji)')).toBe('Hello 😊 World 😊');
    });

    test('removes lone surrogate halves', () => {
      expect(processEmojiText('壊れた\uD83Dテキスト')).toBe('壊れたテキスト');
    });
  });

  describe('LINE emoji metadata', () => {
    test('replaces a Japanese fallback label using metadata', () => {
      const text = '了解です（ありがとう）！';
      const index = text.indexOf('（ありがとう）');

      expect(processLineEmoji(text, [{
        index,
        length: '（ありがとう）'.length,
        productId: 'custom-product',
        emojiId: '001'
      }])).toBe('了解です🙏！');
    });

    test('uses UTF-16 offsets correctly when astral characters precede the LINE emoji', () => {
      const text = '🍎 (ありがとう)';
      expect(text.indexOf('(ありがとう)')).toBe(3);

      expect(replaceLineEmojiPlaceholders(text, [{
        index: 3,
        length: '(ありがとう)'.length,
        productId: 'custom-product',
        emojiId: '002'
      }])).toBe('🍎 🙏');
    });

    test('uses a known product/emoji ID mapping before fallback-label matching', () => {
      expect(processLineEmoji('Hello (love)', [{
        index: 6,
        length: 6,
        productId: '5ac1bfd5040ab15980c9b435',
        emojiId: '001'
      }])).toBe('Hello ❤️');
    });

    test('preserves unknown fallback labels rather than losing meaning', () => {
      expect(processLineEmoji('test (mystery)', [{
        index: 5,
        length: 9,
        productId: 'unknown',
        emojiId: '999'
      }])).toBe('test (mystery)');
    });

    test('ignores invalid metadata safely', () => {
      expect(processLineEmoji('hello (love)', [{
        index: 999,
        length: 6,
        productId: '5ac1bfd5040ab15980c9b435',
        emojiId: '001'
      }])).toBe('hello (love)');
    });
  });

  describe('processLineEmoji', () => {
    test('keeps Unicode LINE text emoji intact', () => {
      expect(processLineEmoji('LINEからの絵文字 😊')).toBe('LINEからの絵文字 😊');
    });

    test('retains legacy PUA conversion', () => {
      expect(processLineEmoji('LINE特殊絵文字 \uE001\uE002')).toBe('LINE特殊絵文字 😀😂');
    });
  });

  describe('processDiscordEmoji', () => {
    test('keeps ordinary Discord emoji', () => {
      expect(processDiscordEmoji('Discordからの絵文字 😊')).toBe('Discordからの絵文字 😊');
    });

    test('converts Discord custom emoji fallback', () => {
      expect(processDiscordEmoji('カスタム絵文字 <:custom:123456789>')).toBe('カスタム絵文字 😊');
    });
  });

  describe('error handling', () => {
    test('handles invalid Unicode text without throwing', () => {
      expect(processEmojiText('\uFFFE\uFFFF')).toBeDefined();
    });

    test('handles very long emoji text', () => {
      expect(processEmojiText('😊'.repeat(10000))).toBeDefined();
    });
  });
});
