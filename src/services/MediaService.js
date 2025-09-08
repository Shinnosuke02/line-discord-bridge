/**
 * メディア処理サービス
 * 画像、動画、音声、ファイルの処理を管理
 */
const { AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');
const { fileTypeFromBuffer } = require('file-type');
const mimeTypes = require('mime-types');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const fileUtils = require('../utils/fileUtils');

/**
 * メディアサービスクラス
 */
class MediaService {
  constructor() {
    this.maxFileSize = config.file.maxFileSize;
    this.supportedImageTypes = config.file.supportedImageMimeTypes;
    this.supportedVideoTypes = config.file.supportedVideoMimeTypes;
    this.supportedAudioTypes = config.file.supportedAudioMimeTypes;
  }

  /**
   * LINEメディアを処理
   * @param {Object} message - LINEメッセージ
   * @param {string} messageType - メッセージタイプ
   * @returns {Object} 処理結果
   */
  async processLineMedia(message, messageType, lineService) {
    try {
      switch (messageType) {
        case 'image':
          return await this.processLineImage(message, lineService);
        case 'video':
          return await this.processLineVideo(message, lineService);
        case 'audio':
          return await this.processLineAudio(message, lineService);
        case 'file':
          return await this.processLineFile(message, lineService);
        case 'sticker':
          return await this.processLineSticker(message);
        default:
          return { content: `Unsupported message type: ${messageType}` };
      }
    } catch (error) {
      logger.error('Failed to process LINE media', {
        messageType,
        messageId: message.id,
        error: error.message
      });
      return { content: `Failed to process ${messageType} message` };
    }
  }

  /**
   * LINE画像を処理
   * @param {Object} message - LINEメッセージ
   * @returns {Object} 処理結果
   */
  async processLineImage(message, lineService) {
    try {
      const buffer = await lineService.getMessageContent(message.id);
      const typeInfo = await this.detectFileType(buffer);
      const ext = typeInfo?.ext || 'jpg';
      const attachment = new AttachmentBuilder(buffer, { name: `image_${message.id}.${ext}` });
      return {
        content: 'Image message',
        files: [attachment]
      };
    } catch (error) {
      logger.error('Failed to process LINE image', {
        messageId: message.id,
        error: error.message
      });
      return { content: '📷 Image message (processing failed)' };
    }
  }

  /**
   * LINE動画を処理
   * @param {Object} message - LINEメッセージ
   * @returns {Object} 処理結果
   */
  async processLineVideo(message, lineService) {
    try {
      const buffer = await lineService.getMessageContent(message.id);
      const typeInfo = await this.detectFileType(buffer);
      const ext = typeInfo?.ext || 'mp4';
      const attachment = new AttachmentBuilder(buffer, { name: `video_${message.id}.${ext}` });
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

  /**
   * LINE音声を処理
   * @param {Object} message - LINEメッセージ
   * @returns {Object} 処理結果
   */
  async processLineAudio(message, lineService) {
    try {
      const buffer = await lineService.getMessageContent(message.id);
      const typeInfo = await this.detectFileType(buffer);
      const ext = typeInfo?.ext || 'm4a';
      const attachment = new AttachmentBuilder(buffer, { name: `audio_${message.id}.${ext}` });
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

  /**
   * LINEファイルを処理
   * @param {Object} message - LINEメッセージ
   * @returns {Object} 処理結果
   */
  async processLineFile(message, lineService) {
    try {
      const fileName = message.fileName || `file_${message.id}`;
      const buffer = await lineService.getMessageContent(message.id);
      const typeInfo = await this.detectFileType(buffer);
      const ext = typeInfo?.ext ? `.${typeInfo.ext}` : '';
      const attachment = new AttachmentBuilder(buffer, { name: `${fileName}${ext}` });
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

  /**
   * LINEスタンプを処理
   * @param {Object} message - LINEメッセージ
   * @returns {Object} 処理結果
   */
  async processLineSticker(message) {
    try {
      const packageId = message.packageId;
      const stickerId = message.stickerId;
      // LINEのスタンプ静的画像URL（一般的な表示用）
      const stickerUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker@2x.png`;
      const resp = await axios.get(stickerUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(resp.data);
      const attachment = new AttachmentBuilder(buffer, { name: `sticker_${stickerId}.png` });
      return {
        content: '',
        files: [attachment]
      };
    } catch (error) {
      logger.error('Failed to process LINE sticker', {
        messageId: message.id,
        error: error.message
      });
      return { content: '😊 Sticker message' };
    }
  }

  /**
   * Discord添付ファイルを処理
   * @param {Array} attachments - Discord添付ファイル配列
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Array} 処理結果配列
   */
  async processDiscordAttachments(attachments, lineUserId, lineService) {
    const results = [];

    for (const attachment of attachments) {
      try {
        const result = await this.processDiscordAttachment(attachment, lineUserId, lineService);
        results.push(result);
      } catch (error) {
        logger.error('Failed to process Discord attachment', {
          attachmentUrl: attachment.url,
          error: error.message
        });
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Discord添付ファイルを処理
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordAttachment(attachment, lineUserId, lineService) {
    try {
      // ファイルサイズチェック
      if (attachment.size > this.maxFileSize) {
        throw new Error(`File too large: ${attachment.size} bytes`);
      }

      // ファイルタイプを判定
      const mimeType = attachment.contentType || mimeTypes.lookup(attachment.name);
      
      // ファイルをダウンロードしてファイルタイプを判定
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const fileTypeInfo = await fileTypeFromBuffer(buffer);

      // 画像ファイルの処理
      if (this.supportedImageTypes.includes(mimeType)) {
        return await this.processDiscordImage(attachment, lineUserId, lineService);
      }

      // 動画ファイルの処理
      if (this.supportedVideoTypes.includes(mimeType)) {
        return await this.processDiscordVideo(attachment, lineUserId, lineService);
      }

      // 音声ファイルの処理
      if (this.supportedAudioTypes.includes(mimeType)) {
        return await this.processDiscordAudio(attachment, lineUserId, lineService);
      }

      // その他のファイル
      return await this.processDiscordFile(attachment, lineUserId, lineService);

    } catch (error) {
      logger.error('Failed to process Discord attachment', {
        attachmentUrl: attachment.url,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discord画像を処理
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordImage(attachment, lineUserId, lineService) {
    try {
      // 画像をLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'image',
        originalContentUrl: attachment.url,
        previewImageUrl: attachment.url
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'image'
      };
    } catch (error) {
      logger.error('Failed to process Discord image', {
        attachmentUrl: attachment.url,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discord動画を処理
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordVideo(attachment, lineUserId, lineService) {
    try {
      // 動画をLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'video',
        originalContentUrl: attachment.url,
        previewImageUrl: attachment.url
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'video'
      };
    } catch (error) {
      logger.error('Failed to process Discord video', {
        attachmentUrl: attachment.url,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discord音声を処理
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordAudio(attachment, lineUserId, lineService) {
    try {
      // 音声をLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'audio',
        originalContentUrl: attachment.url,
        duration: 60000 // デフォルト60秒
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'audio'
      };
    } catch (error) {
      logger.error('Failed to process Discord audio', {
        attachmentUrl: attachment.url,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discordファイルを処理
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordFile(attachment, lineUserId, lineService) {
    try {
      // ファイルをLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'file',
        fileName: attachment.name,
        originalContentUrl: attachment.url
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'file'
      };
    } catch (error) {
      logger.error('Failed to process Discord file', {
        attachmentUrl: attachment.url,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discordスタンプを処理
   * @param {Array} stickers - Discordスタンプ配列
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Array} 処理結果配列
   */
  async processDiscordStickers(stickers, lineUserId, lineService) {
    const results = [];

    for (const sticker of stickers) {
      try {
        const result = await this.processDiscordSticker(sticker, lineUserId, lineService);
        results.push(result);
      } catch (error) {
        logger.error('Failed to process Discord sticker', {
          stickerId: sticker.id,
          error: error.message
        });
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * スタンプをアップローダにアップロード
   * @param {Buffer} buffer - 画像バッファ
   * @param {string} stickerId - スタンプID
   * @param {string} stickerName - スタンプ名
   * @returns {Promise<Object>} アップロード結果
   */
  async uploadStickerToSelf(buffer, stickerId, stickerName) {
    try {
      const fileName = `sticker_${stickerId}_${Date.now()}.png`;
      const tempPath = path.join(process.cwd(), 'temp', fileName);
      
      // tempディレクトリが存在しない場合は作成
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, buffer);
      
      const url = `http://localhost:${config.port}/temp/${fileName}`;
      
      logger.debug('Sticker uploaded to self', {
        stickerId,
        fileName,
        url
      });
      
      return { url, fileName };
    } catch (error) {
      logger.error('Failed to upload sticker to self', {
        stickerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discordスタンプを処理
   * @param {Object} sticker - Discordスタンプ
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordSticker(sticker, lineUserId, lineService) {
    try {
      logger.info('Processing Discord sticker', {
        stickerId: sticker.id,
        stickerName: sticker.name,
        format: sticker.format
      });

      // DiscordスタンプのURLを取得
      let stickerUrl;
      let isLottie = false;
      
      // スタンプのURLを取得（Discord APIから提供されるURLを使用）
      if (sticker.url) {
        stickerUrl = sticker.url;
        // .jsonで終わる場合は.pngに置換
        if (stickerUrl.endsWith('.json')) {
          stickerUrl = stickerUrl.replace('.json', '.png');
          logger.debug('Converted .json URL to .png', { 
            stickerId: sticker.id, 
            originalUrl: sticker.url,
            convertedUrl: stickerUrl,
            format: sticker.format 
          });
        }
        logger.debug('Using Discord provided sticker URL', { 
          stickerId: sticker.id, 
          url: stickerUrl,
          format: sticker.format 
        });
      } else if (sticker.id) {
        // フォールバック: IDからURLを生成
        stickerUrl = `https://cdn.discordapp.com/stickers/${sticker.id}.png`;
        logger.debug('Using generated sticker URL', { 
          stickerId: sticker.id, 
          url: stickerUrl,
          format: sticker.format 
        });
      } else {
        throw new Error('No sticker URL or ID available');
      }
      
      // LOTTIEスタンプの場合は直接テキスト送信
      if (sticker.format === 3) {
        logger.debug('LOTTIE sticker detected, sending as text', { 
          stickerId: sticker.id,
          stickerName: sticker.name 
        });
        
        const lottieResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `🎭 スタンプ: ${sticker.name || 'Unknown Sticker'} (LOTTIE)`
        });
        
        logger.info('LOTTIE sticker sent as text', {
          stickerId: sticker.id,
          lineMessageId: lottieResult.messageId
        });
        
        return {
          success: true,
          lineMessageId: lottieResult.messageId,
          type: 'text',
          fallback: true,
          reason: 'lottie_direct_text'
        };
      }
      
      // スタンプ画像をダウンロードしてファイルタイプを確認
      logger.debug('Downloading sticker from URL', { stickerUrl });
      
      let response;
      let imageBuffer;
      
      try {
        response = await axios.get(stickerUrl, { 
          responseType: 'arraybuffer',
          timeout: 10000 // 10秒タイムアウト
        });
        imageBuffer = Buffer.from(response.data);
        
        logger.debug('Sticker downloaded successfully', {
          stickerId: sticker.id,
          bufferSize: imageBuffer.length,
          contentType: response.headers['content-type']
        });
      } catch (downloadError) {
        logger.error('Failed to download sticker', {
          stickerId: sticker.id,
          stickerUrl,
          error: downloadError.message
        });
        
        
        throw downloadError;
      }
      
      // ファイルタイプを判定
      const fileTypeInfo = await fileTypeFromBuffer(imageBuffer);
      logger.debug('Discord sticker file type detected', {
        stickerId: sticker.id,
        mimeType: fileTypeInfo?.mime,
        extension: fileTypeInfo?.ext
      });

      // APNGの場合は静止画に変換
      let processedUrl = stickerUrl;
      if (fileTypeInfo?.mime === 'image/apng') {
        try {
          // SharpでAPNGを静止画PNGに変換
          const processedBuffer = await sharp(imageBuffer, { animated: true })
            .png()
            .toBuffer();
          
          // 一時ファイルとして保存
          const tempFileName = `sticker_${sticker.id}_${Date.now()}.png`;
          const tempPath = path.join(process.cwd(), 'temp', tempFileName);
          
          // tempディレクトリが存在しない場合は作成
          await fs.mkdir(path.dirname(tempPath), { recursive: true });
          await fs.writeFile(tempPath, processedBuffer);
          processedUrl = `http://localhost:${config.port}/temp/${tempFileName}`;
          
          logger.debug('APNG sticker converted to static PNG', {
            stickerId: sticker.id,
            mimeType: fileTypeInfo?.mime,
            tempPath
          });
        } catch (conversionError) {
          logger.warn('Failed to convert APNG sticker, using original', {
            stickerId: sticker.id,
            error: conversionError.message
          });
        }
      }
      
      // LINEに画像として送信
      logger.debug('Sending sticker to LINE', {
        stickerId: sticker.id,
        processedUrl: processedUrl.substring(0, 100)
      });
      
      // 直接URL送信を試行
      try {
        const result = await lineService.pushMessage(lineUserId, {
          type: 'image',
          originalContentUrl: processedUrl,
          previewImageUrl: processedUrl
        });
        
        logger.info('Discord sticker sent to LINE (direct URL)', {
          stickerId: sticker.id,
          lineMessageId: result.messageId,
          processedUrl: processedUrl.substring(0, 100)
        });
        
        return {
          success: true,
          lineMessageId: result.messageId,
          type: 'image'
        };
      } catch (directUrlError) {
        logger.warn('Direct URL failed, trying upload method', {
          stickerId: sticker.id,
          error: directUrlError.message
        });
        
        // フォールバック: アップローダ経由で送信
        try {
          const uploadResult = await this.uploadStickerToSelf(imageBuffer, sticker.id, sticker.name);
          const uploadResult2 = await lineService.pushMessage(lineUserId, {
            type: 'image',
            originalContentUrl: uploadResult.url,
            previewImageUrl: uploadResult.url
          });
          
          logger.info('Discord sticker sent to LINE (upload method)', {
            stickerId: sticker.id,
            lineMessageId: uploadResult2.messageId,
            uploadUrl: uploadResult.url
          });
          
          return {
            success: true,
            lineMessageId: uploadResult2.messageId,
            type: 'image',
            method: 'upload'
          };
        } catch (uploadError) {
          logger.error('Both direct URL and upload methods failed', {
            stickerId: sticker.id,
            directError: directUrlError.message,
            uploadError: uploadError.message
          });
          throw directUrlError; // 元のエラーを再スロー
        }
      }
    } catch (error) {
      logger.error('Failed to process Discord sticker', {
        stickerId: sticker.id,
        stickerName: sticker.name,
        format: sticker.format,
        error: error.message,
        stack: error.stack
      });
      
      // フォールバック: テキストメッセージとして送信
      try {
        const fallbackResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `🎭 スタンプ: ${sticker.name || 'Unknown Sticker'}`
        });
        
        logger.info('Discord sticker sent as text fallback', {
          stickerId: sticker.id,
          lineMessageId: fallbackResult.messageId
        });
        
        return {
          success: true,
          lineMessageId: fallbackResult.messageId,
          type: 'text',
          fallback: true
        };
      } catch (fallbackError) {
        logger.error('Fallback text message also failed', {
          stickerId: sticker.id,
          error: fallbackError.message
        });
        throw error;
      }
    }
  }

  /**
   * URLを処理
   * @param {string} text - テキスト
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Array} 処理結果配列
   */
  async processUrls(text, lineUserId, lineService) {
    const results = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (!urls) {
      return results;
    }

    for (const url of urls) {
      try {
        const result = await this.processUrl(url, lineUserId, lineService);
        results.push(result);
      } catch (error) {
        logger.error('Failed to process URL', {
          url,
          error: error.message
        });
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * URLを処理
   * @param {string} url - URL
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processUrl(url, lineUserId, lineService) {
    try {
      // URLの種類を判定して適切な処理を実行
      // 画像URL、動画URL、その他のURLを区別
      
      // 簡単な実装として、URLをテキストメッセージとして送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'text',
        text: `🔗 Link: ${url}`
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'url'
      };
    } catch (error) {
      logger.error('Failed to process URL', {
        url,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 画像をリサイズ
   * @param {Buffer} imageBuffer - 画像バッファ
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @returns {Buffer} リサイズされた画像バッファ
   */
  async resizeImage(imageBuffer, width = 800, height = 600) {
    try {
      const resizedBuffer = await sharp(imageBuffer)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      logger.debug('Image resized', {
        originalSize: imageBuffer.length,
        resizedSize: resizedBuffer.length,
        dimensions: `${width}x${height}`
      });

      return resizedBuffer;
    } catch (error) {
      logger.error('Failed to resize image', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ファイルタイプを検出
   * @param {Buffer} buffer - ファイルバッファ
   * @returns {Object} ファイルタイプ情報
   */
  async detectFileType(buffer) {
    try {
      const fileTypeInfo = await fileTypeFromBuffer(buffer);
      
      logger.debug('File type detected', {
        mimeType: fileTypeInfo?.mime,
        extension: fileTypeInfo?.ext
      });

      return fileTypeInfo;
    } catch (error) {
      logger.error('Failed to detect file type', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * アップロードされたファイルを処理
   * @param {Object} file - アップロードされたファイル
   * @returns {Object} 処理結果
   */
  async processUploadedFile(file) {
    try {
      // ファイルタイプの検出
      const fileTypeInfo = await this.detectFileType(file.buffer);
      
      if (!fileTypeInfo) {
        throw new Error('Unable to detect file type');
      }

      // ファイルサイズの検証
      if (!this.validateFileSize(file.size)) {
        throw new Error(`File too large: ${file.size} bytes`);
      }

      // ファイルタイプに応じた処理
      if (this.supportedImageTypes.includes(fileTypeInfo.mime)) {
        return await this.processUploadedImage(file, fileTypeInfo);
      } else if (this.supportedVideoTypes.includes(fileTypeInfo.mime)) {
        return await this.processUploadedVideo(file, fileTypeInfo);
      } else if (this.supportedAudioTypes.includes(fileTypeInfo.mime)) {
        return await this.processUploadedAudio(file, fileTypeInfo);
      } else {
        return await this.processUploadedGenericFile(file, fileTypeInfo);
      }

    } catch (error) {
      logger.error('Failed to process uploaded file', {
        filename: file.originalname,
        size: file.size,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * アップロードされた画像を処理
   * @param {Object} file - ファイル
   * @param {Object} fileTypeInfo - ファイルタイプ情報
   * @returns {Object} 処理結果
   */
  async processUploadedImage(file, fileTypeInfo) {
    try {
      // 画像のリサイズ処理
      const resizedBuffer = await this.resizeImage(file.buffer);
      
      return {
        success: true,
        type: 'image',
        mimeType: fileTypeInfo.mime,
        originalSize: file.buffer.length,
        processedSize: resizedBuffer.length,
        filename: file.originalname
      };
    } catch (error) {
      logger.error('Failed to process uploaded image', {
        filename: file.originalname,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * アップロードされた動画を処理
   * @param {Object} file - ファイル
   * @param {Object} fileTypeInfo - ファイルタイプ情報
   * @returns {Object} 処理結果
   */
  async processUploadedVideo(file, fileTypeInfo) {
    try {
      return {
        success: true,
        type: 'video',
        mimeType: fileTypeInfo.mime,
        size: file.size,
        filename: file.originalname
      };
    } catch (error) {
      logger.error('Failed to process uploaded video', {
        filename: file.originalname,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * アップロードされた音声を処理
   * @param {Object} file - ファイル
   * @param {Object} fileTypeInfo - ファイルタイプ情報
   * @returns {Object} 処理結果
   */
  async processUploadedAudio(file, fileTypeInfo) {
    try {
      return {
        success: true,
        type: 'audio',
        mimeType: fileTypeInfo.mime,
        size: file.size,
        filename: file.originalname
      };
    } catch (error) {
      logger.error('Failed to process uploaded audio', {
        filename: file.originalname,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * アップロードされた汎用ファイルを処理
   * @param {Object} file - ファイル
   * @param {Object} fileTypeInfo - ファイルタイプ情報
   * @returns {Object} 処理結果
   */
  async processUploadedGenericFile(file, fileTypeInfo) {
    try {
      return {
        success: true,
        type: 'file',
        mimeType: fileTypeInfo.mime,
        size: file.size,
        filename: file.originalname
      };
    } catch (error) {
      logger.error('Failed to process uploaded generic file', {
        filename: file.originalname,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ファイルサイズを検証
   * @param {number} size - ファイルサイズ
   * @returns {boolean} 有効かどうか
   */
  validateFileSize(size) {
    return size <= this.maxFileSize;
  }
}

module.exports = MediaService;
