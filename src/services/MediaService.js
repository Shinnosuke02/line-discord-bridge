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
    this.lineLimits = config.file.lineLimits;
    this.supportedImageTypes = config.file.supportedImageMimeTypes;
    this.supportedVideoTypes = config.file.supportedVideoMimeTypes;
    this.supportedAudioTypes = config.file.supportedAudioMimeTypes;
    this.supportedDocumentTypes = config.file.supportedDocumentMimeTypes;
    
    // サンドボックスクリンナップ設定
    this.cleanupInterval = 30 * 60 * 1000; // 30分間隔でクリンナップ
    this.fileMaxAge = 2 * 60 * 60 * 1000; // 2時間でファイルを削除
    this.tempDir = path.join(process.cwd(), 'temp');
    
    // クリンナップタイマーを開始
    this.startCleanupTimer();
  }

  /**
   * クリンナップタイマーを開始
   */
  startCleanupTimer() {
    // 初回クリンナップを実行
    this.cleanupTempFiles();
    
    // 定期的なクリンナップを設定
    this.cleanupTimer = setInterval(() => {
      this.cleanupTempFiles();
    }, this.cleanupInterval);
    
    logger.info('Temp file cleanup timer started', {
      interval: this.cleanupInterval / 1000 / 60, // 分単位
      maxAge: this.fileMaxAge / 1000 / 60 // 分単位
    });
  }

  /**
   * 一時ファイルをクリンナップ
   */
  async cleanupTempFiles() {
    try {
      // tempディレクトリが存在しない場合は何もしない
      try {
        await fs.access(this.tempDir);
      } catch (error) {
        return; // ディレクトリが存在しない
      }

      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const fileAge = now - stats.mtime.getTime();
          
          // ファイルが古い場合は削除
          if (fileAge > this.fileMaxAge) {
            await fs.unlink(filePath);
            deletedCount++;
            totalSize += stats.size;
            
            logger.debug('Deleted old temp file', {
              file,
              age: Math.round(fileAge / 1000 / 60), // 分単位
              size: stats.size
            });
          }
        } catch (error) {
          logger.warn('Failed to process temp file during cleanup', {
            file,
            error: error.message
          });
        }
      }

      if (deletedCount > 0) {
        logger.info('Temp file cleanup completed', {
          deletedCount,
          totalSize: Math.round(totalSize / 1024), // KB単位
          remainingFiles: files.length - deletedCount
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup temp files', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * クリンナップタイマーを停止
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Temp file cleanup timer stopped');
    }
  }

  /**
   * サービス終了時のクリーンアップ
   */
  async shutdown() {
    logger.info('MediaService shutting down...');
    
    // クリンナップタイマーを停止
    this.stopCleanupTimer();
    
    // 最終クリンナップを実行
    await this.cleanupTempFiles();
    
    logger.info('MediaService shutdown completed');
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
      const fileName = `image_${message.id}.${ext}`;
      const discordSafeFileName = this.sanitizeFileNameForDiscord(fileName);
      const attachment = new AttachmentBuilder(buffer, { name: discordSafeFileName });
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
      const fileName = `video_${message.id}.${ext}`;
      const discordSafeFileName = this.sanitizeFileNameForDiscord(fileName);
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
      const fileName = `audio_${message.id}.${ext}`;
      const discordSafeFileName = this.sanitizeFileNameForDiscord(fileName);
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
      
      // ファイル名の拡張子処理を改善
      let finalFileName = fileName;
      if (typeInfo?.ext) {
        const detectedExt = `.${typeInfo.ext}`;
        // 既に拡張子が含まれている場合は追加しない
        if (!fileName.toLowerCase().endsWith(detectedExt.toLowerCase())) {
          finalFileName = `${fileName}${detectedExt}`;
        }
      }
      
      // Discordの2バイト文字問題に対応
      const discordSafeFileName = this.sanitizeFileNameForDiscord(finalFileName);
      
      const attachment = new AttachmentBuilder(buffer, { name: discordSafeFileName });
      return {
        content: `File: ${fileName}`, // 表示用は元のファイル名を使用
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
   * LINEスタンプを処理（フォールバックメッセージのみ）
   * @param {Object} message - LINEメッセージ
   * @returns {Object} 処理結果
   */
  async processLineSticker(message) {
    try {
      const packageId = message.packageId;
      const stickerId = message.stickerId;
      
      logger.info('LINE sticker received, sending fallback message', {
        messageId: message.id,
        packageId: packageId,
        stickerId: stickerId
      });
      
      // フォールバックメッセージとして送信
      return { 
        content: '🎭 LINEステッカーは送信できません' 
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
      // ファイルタイプを判定
      const mimeType = attachment.contentType || mimeTypes.lookup(attachment.name);
      
      // LINE側の制限を考慮したファイルサイズチェック
      const lineLimit = this.getLineLimitForMimeType(mimeType);
      if (attachment.size > lineLimit) {
        logger.warn('File exceeds LINE limit, attempting to use Discord CDN URL', {
          fileSize: attachment.size,
          lineLimit: lineLimit,
          mimeType: mimeType,
          attachmentUrl: attachment.url
        });
        
        // Discord CDN URLを直接使用（24時間有効期限あり）
        return await this.processDiscordAttachmentWithCDN(attachment, lineUserId, lineService, mimeType);
      }

      // 通常のファイルサイズチェック
      if (attachment.size > this.maxFileSize) {
        throw new Error(`File too large: ${attachment.size} bytes`);
      }
      
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

      // ドキュメントファイルの処理
      if (this.supportedDocumentTypes.includes(mimeType)) {
        return await this.processDiscordDocument(attachment, lineUserId, lineService);
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
      logger.info('Processing Discord video', {
        fileName: attachment.name,
        fileSize: attachment.size,
        contentType: attachment.contentType,
        url: attachment.url
      });

      // 動画をLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'video',
        originalContentUrl: attachment.url,
        previewImageUrl: attachment.url
      });

      logger.info('Video sent successfully to LINE', {
        fileName: attachment.name,
        lineMessageId: result.messageId
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'video'
      };
    } catch (error) {
      logger.error('Failed to process Discord video', {
        fileName: attachment.name,
        attachmentUrl: attachment.url,
        error: error.message,
        status: error.status,
        statusCode: error.statusCode
      });
      
      // フォールバック: テキストメッセージとして送信
      try {
        // ファイルタイプベースの表示名を生成（ファイル名は使用しない）
        const fileTypeDisplay = this.getFileTypeDisplayName(
          attachment.contentType, 
          attachment.contentType, 
          attachment.name || ''
        );
        
        logger.info('Using file type display for fallback', {
          originalName: attachment.name,
          contentType: attachment.contentType,
          displayName: fileTypeDisplay
        });
        
        const fallbackResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `🎥 ${fileTypeDisplay}\n🔗 リンク先で参照できます\n${attachment.url}\n📱 LINEの制限により、動画を直接表示できません`
        });

        logger.info('Video sent as text fallback', {
          fileName: attachment.name,
          lineMessageId: fallbackResult.messageId
        });

        return {
          success: true,
          lineMessageId: fallbackResult.messageId,
          type: 'text',
          fallback: true,
          warning: '動画送信失敗、テキストメッセージとして送信'
        };
      } catch (fallbackError) {
        logger.error('Fallback text message also failed', {
          fileName: attachment.name,
          error: fallbackError.message
        });
        throw error;
      }
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
      logger.info('Processing Discord audio', {
        fileName: attachment.name,
        fileSize: attachment.size,
        contentType: attachment.contentType,
        url: attachment.url
      });

      // 音声をLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'audio',
        originalContentUrl: attachment.url,
        duration: 60000 // デフォルト60秒
      });

      logger.info('Audio sent successfully to LINE', {
        fileName: attachment.name,
        lineMessageId: result.messageId
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'audio'
      };
    } catch (error) {
      logger.error('Failed to process Discord audio', {
        fileName: attachment.name,
        attachmentUrl: attachment.url,
        error: error.message,
        status: error.status,
        statusCode: error.statusCode
      });
      
      // フォールバック: テキストメッセージとして送信
      try {
        // ファイルタイプベースの表示名を生成（ファイル名は使用しない）
        const fileTypeDisplay = this.getFileTypeDisplayName(
          attachment.contentType, 
          attachment.contentType, 
          attachment.name || ''
        );
        
        logger.info('Using file type display for fallback', {
          originalName: attachment.name,
          contentType: attachment.contentType,
          displayName: fileTypeDisplay
        });
        
        const fallbackResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `🎵 ${fileTypeDisplay}\n🔗 リンク先で参照できます\n${attachment.url}\n📱 LINEの制限により、音声を直接再生できません`
        });

        logger.info('Audio sent as text fallback', {
          fileName: attachment.name,
          lineMessageId: fallbackResult.messageId
        });

        return {
          success: true,
          lineMessageId: fallbackResult.messageId,
          type: 'text',
          fallback: true,
          warning: '音声送信失敗、テキストメッセージとして送信'
        };
      } catch (fallbackError) {
        logger.error('Fallback text message also failed', {
          fileName: attachment.name,
          error: fallbackError.message
        });
        throw error;
      }
    }
  }

  /**
   * Discordドキュメントを処理
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @returns {Object} 処理結果
   */
  async processDiscordDocument(attachment, lineUserId, lineService) {
    try {
      logger.info('Processing Discord document', {
        fileName: attachment.name,
        fileSize: attachment.size,
        contentType: attachment.contentType,
        url: attachment.url
      });

      // ドキュメントファイルをLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'file',
        fileName: attachment.name,
        originalContentUrl: attachment.url
      });

      logger.info('Document sent successfully to LINE', {
        fileName: attachment.name,
        lineMessageId: result.messageId
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'document'
      };
    } catch (error) {
      logger.error('Failed to process Discord document', {
        fileName: attachment.name,
        attachmentUrl: attachment.url,
        error: error.message,
        status: error.status,
        statusCode: error.statusCode
      });
      
      // フォールバック: テキストメッセージとして送信
      try {
        // ファイルタイプベースの表示名を生成（ファイル名は使用しない）
        const fileTypeDisplay = this.getFileTypeDisplayName(
          attachment.contentType, 
          attachment.contentType, 
          attachment.name || ''
        );
        
        logger.info('Using file type display for fallback', {
          originalName: attachment.name,
          contentType: attachment.contentType,
          displayName: fileTypeDisplay
        });
        
        const fallbackResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `📄 ${fileTypeDisplay}\n🔗 リンク先で参照できます\n${attachment.url}\n📱 LINEの制限により、ドキュメントを直接表示できません`
        });

        logger.info('Document sent as text fallback', {
          fileName: attachment.name,
          lineMessageId: fallbackResult.messageId
        });

        return {
          success: true,
          lineMessageId: fallbackResult.messageId,
          type: 'text',
          fallback: true,
          warning: 'ドキュメント送信失敗、テキストメッセージとして送信'
        };
      } catch (fallbackError) {
        logger.error('Fallback text message also failed', {
          fileName: attachment.name,
          error: fallbackError.message
        });
        throw error;
      }
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
      logger.info('Processing Discord file', {
        fileName: attachment.name,
        fileSize: attachment.size,
        contentType: attachment.contentType,
        url: attachment.url
      });

      // ファイルをLINEに送信
      const result = await lineService.pushMessage(lineUserId, {
        type: 'file',
        fileName: attachment.name,
        originalContentUrl: attachment.url
      });

      logger.info('File sent successfully to LINE', {
        fileName: attachment.name,
        lineMessageId: result.messageId
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'file'
      };
    } catch (error) {
      logger.error('Failed to process Discord file', {
        fileName: attachment.name,
        attachmentUrl: attachment.url,
        error: error.message,
        status: error.status,
        statusCode: error.statusCode
      });
      
      // フォールバック: テキストメッセージとして送信
      try {
        // ファイルタイプベースの表示名を生成（ファイル名は使用しない）
        const fileTypeDisplay = this.getFileTypeDisplayName(
          attachment.contentType, 
          attachment.contentType, 
          attachment.name || ''
        );
        
        logger.info('Using file type display for fallback', {
          originalName: attachment.name,
          contentType: attachment.contentType,
          displayName: fileTypeDisplay
        });
        
        const fallbackResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `📎 ${fileTypeDisplay}\n🔗 リンク先で参照できます\n${attachment.url}\n📱 LINEの制限により、ファイルを直接表示できません`
        });

        logger.info('File sent as text fallback', {
          fileName: attachment.name,
          lineMessageId: fallbackResult.messageId
        });

        return {
          success: true,
          lineMessageId: fallbackResult.messageId,
          type: 'text',
          fallback: true,
          warning: 'ファイル送信失敗、テキストメッセージとして送信'
        };
      } catch (fallbackError) {
        logger.error('Fallback text message also failed', {
          fileName: attachment.name,
          error: fallbackError.message
        });
        throw error;
      }
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
   * スタンプをアップローダにアップロード（レガシーコードのアプローチ）
   * @param {Buffer} buffer - 画像バッファ
   * @param {string} fileName - ファイル名
   * @returns {Promise<Object>} アップロード結果
   */
  async uploadToSelf(buffer, fileName) {
    try {
      const tempPath = path.join(process.cwd(), 'temp', fileName);
      
      // tempディレクトリが存在しない場合は作成
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, buffer);
      
      const url = `http://localhost:${config.port}/temp/${fileName}`;
      
      logger.debug('File uploaded to self', {
        fileName,
        url,
        size: buffer.length
      });
      
      return { url, fileName };
    } catch (error) {
      logger.error('Failed to upload file to self', {
        fileName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 画像をダウンロード（レガシーコードのアプローチ）
   * @param {string} url - 画像URL
   * @param {string} name - ファイル名
   * @returns {Promise<Buffer>} 画像バッファ
   */
  async downloadImage(url, name) {
    try {
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      const buffer = Buffer.from(response.data);
      
      logger.debug('Image downloaded successfully', {
        url: url.substring(0, 100),
        name,
        size: buffer.length,
        contentType: response.headers['content-type']
      });
      
      return buffer;
    } catch (error) {
      logger.error('Failed to download image', {
        url: url.substring(0, 100),
        name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * LINEに画像を送信（レガシーコードのアプローチ）
   * @param {string} userId - LINEユーザーID
   * @param {string} imageUrl - 画像URL
   * @param {Object} lineService - LINEサービス
   * @returns {Promise<Object>} 送信結果
   */
  async sendImageToLine(userId, imageUrl, lineService) {
    try {
      const result = await lineService.pushMessage(userId, {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      });
      
      logger.debug('Image sent to LINE', {
        userId,
        imageUrl: imageUrl.substring(0, 100),
        lineMessageId: result.messageId
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send image to LINE', {
        userId,
        imageUrl: imageUrl.substring(0, 100),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discordスタンプを処理（LINE側ステッカー処理方式を適用）
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

      // LINE側ステッカー処理方式を適用
      // 1. スタンプ画像をダウンロード
      const buffer = await this.downloadStickerImage(sticker);
      
      // 2. 静止画PNGに変換
      const pngBuffer = await this.convertToStaticPng(buffer, sticker);
      
      // 3. LINE側と同様のファイル名処理
      const fileName = `discord_sticker_${sticker.id}.png`;
      const lineSafeFileName = this.sanitizeFileNameForLine(fileName);
      
      // 4. 自己アップローダ経由でLINEに送信
      const selfUrl = await this.uploadToSelf(pngBuffer, lineSafeFileName);
      const result = await lineService.pushMessage(lineUserId, {
        type: 'image',
        originalContentUrl: selfUrl.url,
        previewImageUrl: selfUrl.url
      });
      
      logger.info('Discord sticker sent as image', {
        stickerId: sticker.id,
        stickerName: sticker.name,
        lineMessageId: result.messageId,
        selfUrl: selfUrl.url
      });
      
      return {
        success: true,
        lineMessageId: result.messageId,
        type: 'image',
        filename: lineSafeFileName
      };
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
          text: `🎭 スタンプ: ${sticker.name || 'Unknown Sticker'} (${this.getStickerFormatName(sticker.format)})`
        });
        
        logger.info('Discord sticker sent as text fallback', {
          stickerId: sticker.id,
          stickerName: sticker.name,
          format: sticker.format,
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
   * Discord用にファイル名をサニタイズ
   * Discordは2バイト文字（日本語など）を自動削除するため、
   * 元のファイル名を保持しつつ、Discord安全なファイル名を生成
   * @param {string} fileName - 元のファイル名
   * @returns {string} Discord安全なファイル名
   */
  sanitizeFileNameForDiscord(fileName) {
    if (!fileName) return 'file';
    
    // 元のファイル名をログに記録
    logger.info('Sanitizing filename for Discord', { originalFileName: fileName });
    
    // 拡張子を分離
    const lastDotIndex = fileName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
    
    // 2バイト文字を検出
    const hasMultiByteChars = /[^\x00-\x7F]/.test(nameWithoutExt);
    
    if (hasMultiByteChars) {
      // 2バイト文字が含まれている場合、タイムスタンプベースのファイル名を生成
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const sanitizedName = `file_${timestamp}`;
      
      logger.warn('Filename contains multi-byte characters, using fallback name', {
        originalFileName: fileName,
        fallbackName: `${sanitizedName}${extension}`
      });
      
      return `${sanitizedName}${extension}`;
    }
    
    // 2バイト文字が含まれていない場合はそのまま返す
    return fileName;
  }

  /**
   * Discord CDN URLから元のファイル名を推測・復元
   * Discord側で2バイト文字が削除されたファイル名を、URLから推測して復元
   * @param {string} attachmentName - Discord側で処理済みのファイル名
   * @param {string} attachmentUrl - Discord CDN URL
   * @returns {string} 復元されたファイル名（推測できない場合は元のファイル名）
   */
  recoverFileNameFromDiscordURL(attachmentName, attachmentUrl) {
    if (!attachmentUrl) return attachmentName;
    
    try {
      // URLからファイル名を抽出
      const urlPath = new URL(attachmentUrl).pathname;
      const urlFileName = urlPath.split('/').pop();
      
      // URLパラメータを除去
      const cleanUrlFileName = urlFileName.split('?')[0];
      
      logger.info('Filename recovery attempt', {
        attachmentName: attachmentName,
        urlFileName: cleanUrlFileName,
        urlPath: urlPath,
        url: attachmentUrl
      });
      
      // 破損したファイル名パターンを検出
      if (this.isCorruptedFilename(attachmentName)) {
        logger.warn('Detected corrupted filename, attempting recovery', {
          corruptedName: attachmentName,
          urlFileName: cleanUrlFileName
        });
        
        // URLのファイル名が有効な場合（2バイト文字を含む、または適切な長さ）
        if (cleanUrlFileName && cleanUrlFileName.length > 3 && cleanUrlFileName !== '-_.pdf') {
          logger.info('Recovered filename from URL', {
            corrupted: attachmentName,
            recovered: cleanUrlFileName
          });
          return cleanUrlFileName;
        }
        
        // URLからも復元できない場合、適切なフォールバック名を生成
        const fallbackName = this.generateFallbackFileName(attachmentName, attachmentUrl);
        logger.warn('Using generated fallback filename', {
          corrupted: attachmentName,
          fallback: fallbackName
        });
        return fallbackName;
      }
      
      // URLのファイル名とattachment.nameが異なる場合
      if (cleanUrlFileName && cleanUrlFileName !== attachmentName) {
        // URLのファイル名がより長く、2バイト文字を含んでいる可能性がある場合
        if (cleanUrlFileName.length > attachmentName.length && /[^\x00-\x7F]/.test(cleanUrlFileName)) {
          logger.info('Recovered filename from Discord URL', {
            original: attachmentName,
            recovered: cleanUrlFileName
          });
          return cleanUrlFileName;
        }
      }
      
      return attachmentName;
    } catch (error) {
      logger.error('Failed to recover filename from Discord URL', {
        attachmentName: attachmentName,
        attachmentUrl: attachmentUrl,
        error: error.message
      });
      return attachmentName;
    }
  }

  /**
   * 破損したファイル名かどうかを判定
   * @param {string} filename - ファイル名
   * @returns {boolean} 破損しているかどうか
   */
  isCorruptedFilename(filename) {
    if (!filename) return true;
    
    // 破損パターンの検出
    const corruptedPatterns = [
      /^-_\./,           // -_.pdf のようなパターン
      /^[_-]{1,3}\./,    // -_.pdf, _-.pdf, --.pdf など
      /^\.{1,3}$/,       // 拡張子のみ
      /^[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/, // 有効な文字で始まらない
    ];
    
    return corruptedPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * ファイルタイプから適切な表示名を生成
   * @param {string} mimeType - MIMEタイプ
   * @param {string} contentType - コンテンツタイプ
   * @param {string} fileName - ファイル名（拡張子判定用）
   * @returns {string} ファイルタイプの表示名
   */
  getFileTypeDisplayName(mimeType, contentType, fileName = '') {
    const type = mimeType || contentType || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // MIMEタイプベースの判定
    if (type.includes('pdf')) {
      return 'PDFファイル';
    } else if (type.includes('image/')) {
      return '画像ファイル';
    } else if (type.includes('video/')) {
      return '動画ファイル';
    } else if (type.includes('audio/')) {
      return '音声ファイル';
    } else if (type.includes('text/')) {
      return 'テキストファイル';
    } else if (type.includes('application/msword') || type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml')) {
      return 'WORDファイル';
    } else if (type.includes('application/vnd.ms-excel') || type.includes('application/vnd.openxmlformats-officedocument.spreadsheetml')) {
      return 'EXCELファイル';
    } else if (type.includes('application/vnd.ms-powerpoint') || type.includes('application/vnd.openxmlformats-officedocument.presentationml')) {
      return 'POWERPOINTファイル';
    } else if (type.includes('application/zip') || type.includes('application/x-rar')) {
      return '圧縮ファイル';
    }
    
    // 拡張子ベースの判定（MIMEタイプが不明な場合）
    if (extension === 'pdf') {
      return 'PDFファイル';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
      return '画像ファイル';
    } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension)) {
      return '動画ファイル';
    } else if (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(extension)) {
      return '音声ファイル';
    } else if (['txt', 'csv'].includes(extension)) {
      return 'テキストファイル';
    } else if (['doc', 'docx'].includes(extension)) {
      return 'WORDファイル';
    } else if (['xls', 'xlsx'].includes(extension)) {
      return 'EXCELファイル';
    } else if (['ppt', 'pptx'].includes(extension)) {
      return 'POWERPOINTファイル';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return '圧縮ファイル';
    }
    
    // デフォルト
    return 'ファイル';
  }

  /**
   * スタンプフォーマット名を取得
   * @param {number} format - スタンプフォーマット
   * @returns {string} フォーマット名
   */
  getStickerFormatName(format) {
    switch (format) {
      case 1: return 'PNG';
      case 2: return 'APNG';
      case 3: return 'LOTTIE';
      default: return 'UNKNOWN';
    }
  }

  /**
   * Discordスタンプ画像をダウンロード
   * @param {Object} sticker - Discordスタンプ
   * @returns {Buffer} 画像バッファ
   */
  async downloadStickerImage(sticker) {
    let stickerUrl = sticker.url;
    
    if (!stickerUrl && sticker.id) {
      // フォールバック: IDからURLを生成
      stickerUrl = `https://cdn.discordapp.com/stickers/${sticker.id}.png`;
    }
    
    if (!stickerUrl) {
      throw new Error('No sticker URL or ID available');
    }
    
    // LOTTIEスタンプの場合は静止画URLに変換
    if (sticker.format === 3) { // LOTTIE
      stickerUrl = stickerUrl.replace('.json', '.png');
      logger.debug('Converted LOTTIE URL to PNG', { 
        stickerId: sticker.id, 
        originalUrl: sticker.url,
        convertedUrl: stickerUrl 
      });
    }
    
    // .jsonで終わる場合は.pngに置換
    if (stickerUrl.endsWith('.json')) {
      stickerUrl = stickerUrl.replace('.json', '.png');
      logger.debug('Converted .json URL to .png', { 
        stickerId: sticker.id, 
        originalUrl: sticker.url,
        convertedUrl: stickerUrl 
      });
    }
    
    logger.debug('Downloading sticker image', { 
      stickerId: sticker.id, 
      url: stickerUrl,
      format: sticker.format 
    });
    
    const response = await axios.get(stickerUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  /**
   * スタンプ画像を静止画PNGに変換
   * @param {Buffer} buffer - 元の画像バッファ
   * @param {Object} sticker - Discordスタンプ
   * @returns {Buffer} PNGバッファ
   */
  async convertToStaticPng(buffer, sticker) {
    const type = await fileTypeFromBuffer(buffer);
    
    if (type?.mime === 'image/apng') {
      // APNG→PNG静止画変換
      logger.debug('Converting APNG to static PNG', { 
        stickerId: sticker.id,
        originalMime: type.mime 
      });
      return await sharp(buffer, { animated: true }).png().toBuffer();
    } else if (sticker.format === 3) { // LOTTIE
      // LOTTIEの場合は静止画URLを使用しているので、そのまま返す
      logger.debug('Using LOTTIE as static PNG', { 
        stickerId: sticker.id 
      });
      return buffer;
    } else {
      // 既にPNGの場合はそのまま
      logger.debug('Using original PNG buffer', { 
        stickerId: sticker.id,
        mime: type?.mime 
      });
      return buffer;
    }
  }

  /**
   * LINE側用のファイル名をサニタイズ
   * @param {string} fileName - 元のファイル名
   * @returns {string} サニタイズされたファイル名
   */
  sanitizeFileNameForLine(fileName) {
    // LINE側の制限に合わせたファイル名処理
    // 2バイト文字は問題ないので、主に長さ制限を考慮
    if (fileName.length > 50) {
      const ext = fileName.split('.').pop();
      const base = fileName.substring(0, fileName.lastIndexOf('.'));
      return `${base.substring(0, 40)}.${ext}`;
    }
    return fileName;
  }

  /**
   * フォールバック用のファイル名を生成
   * @param {string} originalName - 元のファイル名
   * @param {string} url - URL
   * @returns {string} 生成されたファイル名
   */
  generateFallbackFileName(originalName, url) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    
    // URLから拡張子を推測
    let extension = '.pdf'; // デフォルト
    try {
      const urlPath = new URL(url).pathname;
      const urlFileName = urlPath.split('/').pop();
      const urlExt = urlFileName.split('?')[0].split('.').pop();
      if (urlExt && urlExt.length <= 4) {
        extension = `.${urlExt}`;
      }
    } catch (error) {
      // URL解析に失敗した場合はデフォルトの拡張子を使用
    }
    
    return `document_${timestamp}${extension}`;
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
   * MIMEタイプに応じたLINE側の制限値を取得
   * @param {string} mimeType - MIMEタイプ
   * @returns {number} 制限値（バイト）
   */
  getLineLimitForMimeType(mimeType) {
    if (this.supportedImageTypes.includes(mimeType)) {
      return this.lineLimits.image;
    } else if (this.supportedVideoTypes.includes(mimeType)) {
      return this.lineLimits.video;
    } else if (this.supportedAudioTypes.includes(mimeType)) {
      return this.lineLimits.audio;
    } else if (this.supportedDocumentTypes.includes(mimeType)) {
      return this.lineLimits.file;
    } else {
      return this.lineLimits.file;
    }
  }

  /**
   * Discord CDN URLを使用してLINEに送信（大容量ファイル用）
   * @param {Object} attachment - Discord添付ファイル
   * @param {string} lineUserId - LINEユーザーID
   * @param {Object} lineService - LINEサービス
   * @param {string} mimeType - MIMEタイプ
   * @returns {Object} 処理結果
   */
  async processDiscordAttachmentWithCDN(attachment, lineUserId, lineService, mimeType) {
    try {
      logger.info('Processing large file with Discord CDN URL', {
        fileName: attachment.name,
        fileSize: attachment.size,
        mimeType: mimeType,
        cdnUrl: attachment.url
      });

      // ファイルタイプに応じてLINEメッセージタイプを決定
      let messageType;
      if (this.supportedImageTypes.includes(mimeType)) {
        messageType = 'image';
      } else if (this.supportedVideoTypes.includes(mimeType)) {
        messageType = 'video';
      } else if (this.supportedAudioTypes.includes(mimeType)) {
        messageType = 'audio';
      } else {
        messageType = 'file';
      }

      // Discord CDN URLを直接使用してLINEに送信
      const messageData = this.createLineMessageData(messageType, attachment);
      const result = await lineService.pushMessage(lineUserId, messageData);

      logger.info('Large file sent successfully via Discord CDN', {
        fileName: attachment.name,
        messageType: messageType,
        lineMessageId: result.messageId,
        cdnUrl: attachment.url
      });

      return {
        success: true,
        lineMessageId: result.messageId,
        type: messageType,
        cdnUsed: true,
        warning: 'Discord CDN URL使用（24時間有効期限あり）'
      };

    } catch (error) {
      logger.error('Failed to process large file with Discord CDN', {
        fileName: attachment.name,
        fileSize: attachment.size,
        error: error.message
      });

      // フォールバック: テキストメッセージとして送信
      try {
        // ファイルタイプベースの表示名を生成（ファイル名は使用しない）
        const fileTypeDisplay = this.getFileTypeDisplayName(
          attachment.contentType || mimeType, 
          attachment.contentType || mimeType, 
          attachment.name || ''
        );
        
        logger.info('Using file type display for fallback', {
          originalName: attachment.name,
          contentType: attachment.contentType || mimeType,
          displayName: fileTypeDisplay
        });
        
        const fallbackResult = await lineService.pushMessage(lineUserId, {
          type: 'text',
          text: `📎 ${fileTypeDisplay}\n🔗 リンク先で参照できます\n${attachment.url}\n📱 LINEの制限により、ファイルを直接表示できません\n⏰ 注意: このリンクは24時間で無効になります`
        });

        return {
          success: true,
          lineMessageId: fallbackResult.messageId,
          type: 'text',
          fallback: true,
          warning: 'フォールバック: テキストメッセージとして送信'
        };
      } catch (fallbackError) {
        logger.error('Fallback text message also failed', {
          fileName: attachment.name,
          error: fallbackError.message
        });
        throw error;
      }
    }
  }

  /**
   * LINEメッセージデータを作成
   * @param {string} messageType - メッセージタイプ
   * @param {Object} attachment - Discord添付ファイル
   * @returns {Object} LINEメッセージデータ
   */
  createLineMessageData(messageType, attachment) {
    const baseData = {
      type: messageType,
      originalContentUrl: attachment.url,
      previewImageUrl: attachment.url
    };

    switch (messageType) {
      case 'audio':
        return {
          ...baseData,
          duration: 60000 // 60秒
        };
      case 'file':
        return {
          ...baseData,
          fileName: attachment.name
        };
      default:
        return baseData;
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
