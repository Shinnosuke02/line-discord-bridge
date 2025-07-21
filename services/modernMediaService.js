const axios = require('axios');
const { AttachmentBuilder } = require('discord.js');
const { Client: LineClient } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');
const ModernFileProcessor = require('./modernFileProcessor');

/**
 * 近代化されたメディア処理サービス
 * LINE Bot API v7対応、より正確なファイル処理
 */
class ModernMediaService {
  constructor() {
    this.lineClient = new LineClient(config.line);
    this.fileProcessor = new ModernFileProcessor();
  }

  /**
   * URLからファイルをダウンロード
   * @param {string} url - ダウンロードURL
   * @param {string} filename - ファイル名
   * @returns {Promise<Buffer>} ファイルデータ
   */
  async downloadFile(url, filename) {
    try {
      logger.debug('Downloading file', { url, filename });
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30秒タイムアウト
        headers: {
          'User-Agent': 'LINE-Discord-Bridge/2.0.0',
        },
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to download file', { url, filename, error: error.message });
      throw error;
    }
  }

  /**
   * LINEメッセージIDからコンテンツを取得
   * @param {string} messageId - LINEメッセージID
   * @returns {Promise<Buffer>} コンテンツデータ
   */
  async getLineContent(messageId) {
    try {
      logger.debug('Getting LINE content', { messageId });
      const stream = await this.lineClient.getMessageContent(messageId);
      
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to get LINE content', { messageId, error: error.message });
      throw error;
    }
  }

  /**
   * LINE画像メッセージをDiscord用に変換
   * @param {Object} message - LINE画像メッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineImage(message) {
    try {
      logger.info('=== Modern MediaService: LINE Image Processing Start ===', {
        messageId: message.id,
        messageType: message.type
      });

      const content = await this.getLineContent(message.id);
      
      logger.info('Content downloaded', {
        messageId: message.id,
        contentLength: content.length
      });
      
      // ModernFileProcessorを使用して画像を処理（非同期）
      const result = await this.fileProcessor.processLineMedia(message, content, 'image');
      
      logger.info('ModernFileProcessor result', {
        messageId: message.id,
        result
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const attachment = new AttachmentBuilder(content, { name: result.filename });
      
      logger.info('=== Modern MediaService: LINE Image Processing Complete ===', { 
        messageId: message.id, 
        filename: result.filename,
        mimeType: result.mimeType,
        extension: result.extension,
        size: result.size,
        attachmentName: attachment.name
      });
      
      return {
        content: `**画像**`,
        files: [attachment],
      };
    } catch (error) {
      logger.error('Failed to process LINE image', { 
        messageId: message.id, 
        error: error.message,
        stack: error.stack
      });
      return {
        content: `**画像** (ダウンロードに失敗しました)`,
      };
    }
  }

  /**
   * LINE動画メッセージをDiscord用に変換
   * @param {Object} message - LINE動画メッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineVideo(message) {
    try {
      const content = await this.getLineContent(message.id);
      const result = await this.fileProcessor.processLineMedia(message, content, 'video');
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const attachment = new AttachmentBuilder(content, { name: result.filename });
      
      logger.info('LINE video processed successfully', { 
        messageId: message.id, 
        filename: result.filename,
        mimeType: result.mimeType,
        extension: result.extension,
        size: result.size
      });
      
      return {
        content: `**動画** (${message.duration}ms)`,
        files: [attachment],
      };
    } catch (error) {
      logger.error('Failed to process LINE video', { messageId: message.id, error: error.message });
      return {
        content: `**動画** (ダウンロードに失敗しました)`,
      };
    }
  }

  /**
   * LINE音声メッセージをDiscord用に変換
   * @param {Object} message - LINE音声メッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineAudio(message) {
    try {
      const content = await this.getLineContent(message.id);
      const result = await this.fileProcessor.processLineMedia(message, content, 'audio');
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const attachment = new AttachmentBuilder(content, { name: result.filename });
      
      logger.info('LINE audio processed successfully', { 
        messageId: message.id, 
        filename: result.filename,
        mimeType: result.mimeType,
        extension: result.extension,
        size: result.size
      });
      
      return {
        content: `**音声** (${message.duration}ms)`,
        files: [attachment],
      };
    } catch (error) {
      logger.error('Failed to process LINE audio', { messageId: message.id, error: error.message });
      return {
        content: `**音声** (ダウンロードに失敗しました)`,
      };
    }
  }

  /**
   * LINEファイルメッセージをDiscord用に変換
   * @param {Object} message - LINEファイルメッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineFile(message) {
    try {
      const content = await this.getLineContent(message.id);
      const result = await this.fileProcessor.processLineMedia(message, content, 'file');
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const attachment = new AttachmentBuilder(content, { name: result.filename });
      
      logger.info('LINE file processed successfully', { 
        messageId: message.id, 
        filename: result.filename,
        mimeType: result.mimeType,
        extension: result.extension,
        size: result.size
      });
      
      return {
        content: `**ファイル**: ${result.filename} (${message.fileSize} bytes)`,
        files: [attachment],
      };
    } catch (error) {
      logger.error('Failed to process LINE file', { messageId: message.id, error: error.message });
      return {
        content: `**ファイル**: ${message.fileName || 'unknown'} (ダウンロードに失敗しました)`,
      };
    }
  }

  /**
   * LINEスタンプメッセージをDiscord用に変換
   * @param {Object} message - LINEスタンプメッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineSticker(message) {
    try {
      // スタンプ情報を取得
      const stickerInfo = await this.getStickerInfo(message.packageId, message.stickerId);
      
      let content = null;
      let successfulUrl = null;

      // 複数のURLパターンを試行
      for (const url of stickerInfo.urlPatterns) {
        try {
          content = await this.downloadFile(url, `sticker_${message.stickerId}.png`);
          successfulUrl = url;
          logger.debug('Successfully downloaded sticker', { 
            stickerId: message.stickerId, 
            url: successfulUrl 
          });
          break;
        } catch (downloadError) {
          logger.debug('Failed to download sticker from URL', { 
            url, 
            stickerId: message.stickerId,
            error: downloadError.message 
          });
          continue;
        }
      }

      if (content) {
        const attachment = new AttachmentBuilder(content, { 
          name: `sticker_${message.stickerId}.png` 
        });
        
        return {
          content: `**スタンプ** (${message.packageId}/${message.stickerId})`,
          files: [attachment],
        };
      } else {
        // すべてのURLが失敗した場合、フォールバック
        logger.warn('All sticker download attempts failed', { 
          stickerId: message.stickerId,
          packageId: message.packageId 
        });
        return {
          content: `**スタンプ** (${message.packageId}/${message.stickerId}) (画像を取得できませんでした)`,
        };
      }
    } catch (error) {
      logger.error('Failed to process LINE sticker', { 
        messageId: message.id, 
        stickerId: message.stickerId,
        error: error.message 
      });
      return {
        content: `**スタンプ** (${message.packageId}/${message.stickerId}) (処理に失敗しました)`,
      };
    }
  }

  /**
   * LINEスタンプ情報を取得
   * @param {string} packageId - スタンプパッケージID
   * @param {string} stickerId - スタンプID
   * @returns {Promise<Object>} スタンプ情報
   */
  async getStickerInfo(packageId, stickerId) {
    try {
      logger.debug('Getting sticker info', { packageId, stickerId });
      
      return {
        packageId,
        stickerId,
        // 一般的なスタンプURLパターン
        urlPatterns: [
          `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`,
          `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker@2x.png`,
          `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker.png`,
          `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker@2x.png`,
        ]
      };
    } catch (error) {
      logger.error('Failed to get sticker info', { packageId, stickerId, error: error.message });
      throw error;
    }
  }

  /**
   * Discord添付ファイルをLINE用に変換（外部URL使用版）
   * @param {Array} attachments - Discord添付ファイル配列
   * @param {string} userId - LINEユーザーID
   * @returns {Promise<Array>} 処理結果の配列
   */
  async processDiscordAttachments(attachments, userId) {
    const results = [];
    
    for (const attachment of attachments) {
      try {
        // ファイルサイズチェック（LINE制限: 10MB）
        if (attachment.size > 10 * 1024 * 1024) {
          await this.lineService.pushMessage(userId, {
            type: 'text',
            text: `**ファイル**: ${attachment.name} (サイズが大きすぎます - 10MB以下にしてください)`,
          });
          results.push({ success: false, reason: 'file_too_large' });
          continue;
        }

        // Discord CDN URLを使用してLINEに送信
        logger.info('Processing Discord attachment with CDN URL', {
          filename: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          url: attachment.url.substring(0, 100) + '...'
        });

        try {
          if (attachment.contentType?.startsWith('image/')) {
            await this.lineService.sendImageByUrl(userId, attachment.url, attachment.url);
            results.push({ success: true, type: 'image', filename: attachment.name });
          } else if (attachment.contentType?.startsWith('video/')) {
            await this.lineService.sendVideoByUrl(userId, attachment.url, attachment.url);
            results.push({ success: true, type: 'video', filename: attachment.name });
          } else if (attachment.contentType?.startsWith('audio/')) {
            await this.lineService.sendAudioByUrl(userId, attachment.url);
            results.push({ success: true, type: 'audio', filename: attachment.name });
          } else {
            // その他のファイルは情報付きで送信
            const fileInfo = [
              `**ファイル**: ${attachment.name}`,
              `サイズ: ${(attachment.size / 1024).toFixed(1)} KB`,
              `タイプ: ${attachment.contentType || '不明'}`,
              `URL: ${attachment.url}`
            ].join('\n');
            
            await this.lineService.pushMessage(userId, {
              type: 'text',
              text: fileInfo
            });
            results.push({ success: true, type: 'url', filename: attachment.name });
          }
        } catch (error) {
          logger.error('Failed to send Discord attachment to LINE', {
            filename: attachment.name,
            error: error.message
          });
          
          // フォールバック: ファイル情報を表示
          const fileInfo = [
            `**ファイル**: ${attachment.name}`,
            `サイズ: ${(attachment.size / 1024).toFixed(1)} KB`,
            `タイプ: ${attachment.contentType || '不明'}`,
            `URL: ${attachment.url}`,
            `(送信に失敗しました: ${error.message})`
          ].join('\n');
          
          await this.lineService.pushMessage(userId, {
            type: 'text',
            text: fileInfo
          });
          results.push({ success: false, reason: 'send_error', filename: attachment.name });
        }
        

      } catch (error) {
        logger.error('Failed to process Discord attachment', { 
          attachment: attachment.name, 
          error: error.message 
        });
        await this.lineService.pushMessage(userId, {
          type: 'text',
          text: `**ファイル**: ${attachment.name} (処理に失敗しました)`,
        });
        results.push({ success: false, reason: 'processing_error', filename: attachment.name });
      }
    }
    
    return results;
  }

  /**
   * URLを検出して送信（シンプル版）
   * @param {string} text - テキスト
   * @param {string} userId - LINEユーザーID
   * @returns {Promise<Array>} 処理結果の配列
   */
  async processUrls(text, userId) {
    const results = [];
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    logger.info('Processing URLs in text', {
      textLength: text.length,
      urlCount: urls.length
    });
    
    for (const url of urls) {
      try {
        // すべてのURLをシンプルに送信
        await this.lineService.pushMessage(userId, {
          type: 'text',
          text: url
        });
        
        results.push({ success: true, type: 'url', url });
      } catch (error) {
        logger.error('Failed to send URL', { url: url.substring(0, 100) + '...', error: error.message });
        results.push({ success: false, type: 'error', url });
      }
    }
    
    return results;
  }
}

module.exports = ModernMediaService; 