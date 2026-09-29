const { AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');
const logger = require('../../utils/logger');
const {
  processLineEmoji,
  resolveLineEmojiReplacement
} = require('../../utils/emojiHandler');
const {
  isAnimatedPngBuffer,
  isAnimatedStickerResourceType
} = require('../../utils/lineSticker');

const MAX_DISCORD_LINE_EMOJI_ATTACHMENTS = 10;

function createLineMediaProcessors(deps) {
  return {
    image: (message, lineService) => processLineImage(deps, message, lineService),
    video: (message, lineService) => processLineVideo(deps, message, lineService),
    audio: (message, lineService) => processLineAudio(deps, message, lineService),
    file: (message, lineService) => processLineFile(deps, message, lineService),
    sticker: (message) => processLineSticker(deps, message),
    textEmoji: (text, emojis) => processLineTextEmoji(deps, text, emojis)
  };
}

function getValidLineEmojiRanges(text, emojis = []) {
  if (!Array.isArray(emojis)) {
    return [];
  }

  const sorted = emojis
    .filter((emoji) => Number.isInteger(emoji?.index)
      && Number.isInteger(emoji?.length)
      && emoji.index >= 0
      && emoji.length > 0
      && emoji.index + emoji.length <= text.length)
    .sort((a, b) => a.index - b.index || a.length - b.length);

  const nonOverlapping = [];
  let nextAvailableIndex = 0;

  for (const emoji of sorted) {
    if (emoji.index < nextAvailableIndex) {
      logger.warn('Skipping overlapping LINE emoji metadata for image rendering', {
        index: emoji.index,
        length: emoji.length,
        productId: emoji.productId,
        emojiId: emoji.emojiId
      });
      continue;
    }

    nonOverlapping.push(emoji);
    nextAvailableIndex = emoji.index + emoji.length;
  }

  return nonOverlapping;
}

async function processLineTextEmoji(deps, text, emojis = []) {
  if (!text) {
    return { content: text || '', files: [] };
  }

  const ranges = getValidLineEmojiRanges(text, emojis);
  if (ranges.length === 0) {
    return {
      content: processLineEmoji(text, emojis),
      files: []
    };
  }

  const imageCandidates = ranges
    .filter((emoji) => emoji.productId && emoji.emojiId)
    .slice(0, MAX_DISCORD_LINE_EMOJI_ATTACHMENTS);

  const imageResults = await Promise.all(imageCandidates.map(async (emoji, ordinal) => {
    try {
      const asset = await deps.downloadLineEmojiAsset(emoji.productId, emoji.emojiId);
      return { emoji, ordinal, asset };
    } catch (error) {
      logger.debug('LINE emoji image unavailable; using text fallback', {
        productId: emoji.productId,
        emojiId: emoji.emojiId,
        error: error.message
      });
      return { emoji, ordinal, asset: null };
    }
  }));

  const imageRanges = new Map();
  const files = [];

  for (const { emoji, ordinal, asset } of imageResults) {
    if (!asset?.buffer) {
      continue;
    }

    const end = emoji.index + emoji.length;
    const fallbackText = text.slice(emoji.index, end);
    const rangeKey = `${emoji.index}:${emoji.length}`;
    const fileName = deps.sanitizeFileNameForDiscord(
      `line_emoji_${emoji.productId}_${emoji.emojiId}_${ordinal + 1}.png`
    );

    imageRanges.set(rangeKey, true);
    files.push(new AttachmentBuilder(asset.buffer, {
      name: fileName,
      description: fallbackText || 'LINE emoji'
    }));
  }

  let content = text;
  for (const emoji of [...ranges].sort((a, b) => b.index - a.index || b.length - a.length)) {
    const end = emoji.index + emoji.length;
    const fallbackText = text.slice(emoji.index, end);
    const rangeKey = `${emoji.index}:${emoji.length}`;

    const replacement = imageRanges.has(rangeKey)
      ? ''
      : resolveLineEmojiReplacement(fallbackText, emoji);

    content = content.slice(0, emoji.index) + replacement + content.slice(end);
  }

  return {
    content: processLineEmoji(content, []),
    files
  };
}

async function processLineImage(deps, message, lineService) {
  try {
    const buffer = await lineService.getMessageContent(message.id);
    const typeInfo = await deps.detectFileType(buffer);
    const isHeic = typeInfo?.mime === 'image/heic' || typeInfo?.mime === 'image/heif';
    const convertedBuffer = isHeic
      ? await sharp(buffer, { animated: false }).jpeg({ quality: 85 }).toBuffer()
      : buffer;
    const ext = isHeic ? 'jpg' : (typeInfo?.ext || 'jpg');
    const fileName = `image_${message.id}.${ext}`;
    const discordSafeFileName = deps.sanitizeFileNameForDiscord(fileName);
    const attachment = new AttachmentBuilder(convertedBuffer, { name: discordSafeFileName });
    return {
      content: '',
      files: [attachment]
    };
  } catch (error) {
    logger.error('Failed to process LINE image', {
      messageId: message.id,
      error: error.message
    });
    return { content: '', files: [] };
  }
}

async function processLineVideo(deps, message, lineService) {
  try {
    const buffer = await lineService.getMessageContent(message.id);
    const typeInfo = await deps.detectFileType(buffer);
    const ext = typeInfo?.ext || 'mp4';
    const fileName = `video_${message.id}.${ext}`;
    const discordSafeFileName = deps.sanitizeFileNameForDiscord(fileName);
    const attachment = new AttachmentBuilder(buffer, { name: discordSafeFileName });
    return {
      content: 'Video message',
      files: [attachment]
    };
  } catch (error) {
    logger.error('Failed to process LINE video', {
      messageId: message.id,
      error: error.message
    });
    return { content: '🎥 Video message (processing failed)' };
  }
}

async function processLineAudio(deps, message, lineService) {
  try {
    const buffer = await lineService.getMessageContent(message.id);
    const typeInfo = await deps.detectFileType(buffer);
    const ext = typeInfo?.ext || 'm4a';
    const fileName = `audio_${message.id}.${ext}`;
    const discordSafeFileName = deps.sanitizeFileNameForDiscord(fileName);
    const attachment = new AttachmentBuilder(buffer, { name: discordSafeFileName });
    return {
      content: 'Audio message',
      files: [attachment]
    };
  } catch (error) {
    logger.error('Failed to process LINE audio', {
      messageId: message.id,
      error: error.message
    });
    return { content: '🎵 Audio message (processing failed)' };
  }
}

async function processLineFile(deps, message, lineService) {
  try {
    const fileName = message.fileName || `file_${message.id}`;
    const buffer = await lineService.getMessageContent(message.id);
    const typeInfo = await deps.detectFileType(buffer);
    const isHeic = typeInfo?.mime === 'image/heic' || typeInfo?.mime === 'image/heif' || /\.(heic|heif)$/i.test(fileName);
    const outputBuffer = isHeic
      ? await sharp(buffer, { animated: false }).jpeg({ quality: 85 }).toBuffer()
      : buffer;

    let finalFileName = fileName;
    if (isHeic) {
      const base = fileName.replace(/\.[^.]+$/, '');
      finalFileName = `${base}.jpg`;
    } else if (typeInfo?.ext) {
      const detectedExt = `.${typeInfo.ext}`;
      if (!fileName.toLowerCase().endsWith(detectedExt.toLowerCase())) {
        finalFileName = `${fileName}${detectedExt}`;
      }
    }

    const discordSafeFileName = deps.sanitizeFileNameForDiscord(finalFileName);
    const attachment = new AttachmentBuilder(outputBuffer, { name: discordSafeFileName });
    return {
      content: `File: ${fileName}`,
      files: [attachment]
    };
  } catch (error) {
    logger.error('Failed to process LINE file', {
      messageId: message.id,
      error: error.message
    });
    return { content: '📎 File message (processing failed)' };
  }
}

async function processLineSticker(deps, message) {
  try {
    const packageId = message.packageId;
    const stickerId = message.stickerId;
    const stickerResourceType = message.stickerResourceType || 'STATIC';

    logger.info('Processing LINE sticker', {
      messageId: message.id,
      packageId,
      stickerId,
      stickerResourceType
    });

    const stickerAsset = await deps.downloadLineStickerAsset(stickerId, stickerResourceType);
    let processedBuffer = stickerAsset.buffer;
    let fileName = `sticker_${stickerId}.png`;
    const isAnimatedSticker = isAnimatedStickerResourceType(stickerResourceType);

    if (isAnimatedSticker && isAnimatedPngBuffer(stickerAsset.buffer)) {
      try {
        processedBuffer = await deps.convertAnimatedStickerToGif(stickerAsset.buffer, stickerId);
        fileName = `sticker_${stickerId}.gif`;
        logger.info('Converted LINE animated sticker to GIF for Discord', {
          stickerId,
          stickerResourceType
        });
      } catch (conversionError) {
        logger.warn('Failed to convert animated LINE sticker to GIF, falling back to static frame', {
          stickerId,
          stickerResourceType,
          error: conversionError.message
        });
        processedBuffer = await sharp(stickerAsset.buffer, { animated: true }).png().toBuffer();
      }
    } else {
      const fileTypeInfo = await deps.detectFileType(stickerAsset.buffer);

      if (fileTypeInfo) {
        logger.debug('Detected file type', {
          stickerId,
          mimeType: fileTypeInfo.mime,
          extension: fileTypeInfo.ext
        });

        if (fileTypeInfo.mime === 'image/webp') {
          logger.info('Converting WebP to PNG', { stickerId });
          processedBuffer = await sharp(stickerAsset.buffer).png().toBuffer();
        } else if (!fileTypeInfo.mime.startsWith('image/png')) {
          logger.info('Converting to PNG format', {
            stickerId,
            originalMime: fileTypeInfo.mime
          });
          processedBuffer = await sharp(stickerAsset.buffer).png().toBuffer();
        }
      }
    }

    const attachment = new AttachmentBuilder(processedBuffer, { name: fileName });

    logger.info('LINE sticker processed successfully', {
      messageId: message.id,
      stickerId,
      fileName,
      stickerResourceType,
      originalBufferSize: stickerAsset.buffer.length,
      processedBufferSize: processedBuffer.length,
      converted: stickerAsset.buffer.length !== processedBuffer.length,
      sourceUrl: stickerAsset.url
    });

    return {
      content: '',
      files: [attachment]
    };
  } catch (error) {
    logger.error('Failed to process LINE sticker', {
      messageId: message.id,
      packageId: message.packageId,
      stickerId: message.stickerId,
      error: error.message,
      stack: error.stack
    });

    return { content: '😊 Sticker message' };
  }
}

module.exports = {
  createLineMediaProcessors,
  processLineTextEmoji
};
