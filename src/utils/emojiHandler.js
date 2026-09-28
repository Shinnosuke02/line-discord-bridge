/**
 * Emoji processing utilities for LINE <-> Discord.
 *
 * LINE sends LINE-emoji inside text as fallback strings such as "(love)"
 * and exposes the real ranges/product IDs in message.emojis. Discord cannot
 * render LINE emoji natively, so only explicitly mapped product/emoji IDs
 * are converted to Unicode. Unknown emoji keep LINE's fallback text.
 */
const logger = require('./logger');

// LINE's own reference example identifies this pair as "(love)".
const LINE_EMOJI_ID_MAP = new Map([
  ['5ac1bfd5040ab15980c9b435:001', '❤️']
]);

/**
 * Normalize emoji-bearing text without destroying emoji composition.
 *
 * U+200D ZERO WIDTH JOINER and U+FE0F VARIATION SELECTOR-16 are intentionally
 * preserved because removing them changes compound/color emoji rendering.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeEmojis(text) {
  if (!text) return text;

  try {
    let normalized = text.normalize('NFC');

    // Remove only invisible separators that do not participate in emoji
    // composition. Keep ZWNJ/ZWJ and variation selectors intact.
    normalized = normalized.replace(/[\u200B\uFEFF]/g, '');

    return normalized;
  } catch (error) {
    logger.warn('Emoji normalization failed', { error: error.message });
    return text;
  }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isValidEmoji(text) {
  if (!text) return false;

  try {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0F5}]|[\u{1F200}-\u{1F2FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;

    return emojiRegex.test(text);
  } catch (error) {
    logger.warn('Emoji validation failed', { error: error.message });
    return false;
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function processEmojiText(text) {
  if (!text) return text;

  try {
    let processed = normalizeEmojis(text);

    // Remove lone surrogate halves while preserving valid pairs.
    processed = processed.replace(/([\uD800-\uDBFF])(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '');

    // Legacy fallback retained for backward compatibility.
    processed = processed.replace(/\(emoji\)/gi, '😊');

    return Array.from(processed).join('');
  } catch (error) {
    logger.error('Emoji processing failed', { error: error.message });
    return text;
  }
}

function resolveLineEmojiReplacement(fallbackText, emoji = {}) {
  const key = emoji.productId && emoji.emojiId
    ? `${emoji.productId}:${emoji.emojiId}`
    : null;

  if (key && LINE_EMOJI_ID_MAP.has(key)) {
    return LINE_EMOJI_ID_MAP.get(key);
  }

  // The fallback label is descriptive text, not a unique emoji identity.
  // Different LINE emoji can share the same fallback such as "ありがとう".
  // Do not infer a Unicode replacement from that label alone.
  logger.debug('Unmapped LINE emoji preserved as fallback text', {
    productId: emoji.productId || null,
    emojiId: emoji.emojiId || null,
    fallbackText
  });

  return fallbackText;
}

/**
 * Replace LINE emoji fallback ranges using message.emojis metadata.
 *
 * LINE defines index/length in UTF-16 code units. JavaScript String#slice
 * uses the same indexing model, so offsets can be applied directly.
 *
 * @param {string} text
 * @param {Array<Object>} emojis
 * @returns {string}
 */
function replaceLineEmojiPlaceholders(text, emojis = []) {
  if (!text || !Array.isArray(emojis) || emojis.length === 0) {
    return text;
  }

  const valid = emojis
    .filter((emoji) => Number.isInteger(emoji?.index)
      && Number.isInteger(emoji?.length)
      && emoji.index >= 0
      && emoji.length > 0
      && emoji.index + emoji.length <= text.length)
    .sort((a, b) => b.index - a.index || b.length - a.length);

  let result = text;
  let nextBoundary = text.length;

  for (const emoji of valid) {
    const end = emoji.index + emoji.length;

    // Defensive guard against malformed/overlapping metadata.
    if (end > nextBoundary) {
      logger.warn('Skipping overlapping LINE emoji metadata', {
        index: emoji.index,
        length: emoji.length,
        productId: emoji.productId,
        emojiId: emoji.emojiId
      });
      continue;
    }

    const fallbackText = text.slice(emoji.index, end);
    const replacement = resolveLineEmojiReplacement(fallbackText, emoji);
    result = result.slice(0, emoji.index) + replacement + result.slice(end);
    nextBoundary = emoji.index;
  }

  return result;
}

/**
 * @param {string} text
 * @param {Array<Object>} emojis
 * @returns {string}
 */
function processLineEmoji(text, emojis = []) {
  if (!text) return text;

  try {
    let processed = replaceLineEmojiPlaceholders(text, emojis);
    processed = processEmojiText(processed);

    const lineEmojiMap = {
      '\uE001': '😀',
      '\uE002': '😂',
      '\uE0E0': '❤️',
      '\uE0E3': '😊'
    };

    Object.entries(lineEmojiMap).forEach(([lineEmoji, standardEmoji]) => {
      processed = processed.split(lineEmoji).join(standardEmoji);
    });

    return processed;
  } catch (error) {
    logger.error('Line emoji processing failed', { error: error.message });
    return text;
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function processDiscordEmoji(text) {
  if (!text) return text;

  try {
    let processed = processEmojiText(text);
    processed = processed.replace(/<a?:[^:]+:\d+>/g, '😊');
    return processed;
  } catch (error) {
    logger.error('Discord emoji processing failed', { error: error.message });
    return text;
  }
}

module.exports = {
  normalizeEmojis,
  isValidEmoji,
  processEmojiText,
  processLineEmoji,
  processDiscordEmoji,
  replaceLineEmojiPlaceholders,
  resolveLineEmojiReplacement
};
