const { AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');
const logger = require('../../utils/logger');
const {
  isAnimatedPngBuffer,
  isAnimatedStickerResourceType
} = require('../../utils/lineSticker');

function createLineMediaProcessors(deps) {
  return {
    image: (message, lineService) => processLineImage(deps, message, lineService),
    video: (message, lineService) => processLineVideo(deps, message, lineService),
    audio: (message, lineService) => processLineAudio(deps, message, lineService),
    file: (message, lineService) => processLineFile(deps, message, lineService),
    sticker: (message) => processLineSticker(deps, message)
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
  createLineMediaProcessors
};
