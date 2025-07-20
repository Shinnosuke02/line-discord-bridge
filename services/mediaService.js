/**
 * メディア処理サービス
 */
const axios = require('axios');
const { AttachmentBuilder } = require('discord.js');
const { Client: LineClient } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');

class MediaService {
  constructor() {
    this.lineClient = new LineClient(config.line);
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
          'User-Agent': 'LINE-Discord-Bridge/1.0.0',
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
   * ファイル拡張子を取得
   * @param {string} filename - ファイル名
   * @returns {string} 拡張子
   */
  getFileExtension(filename) {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * MIMEタイプから拡張子を取得
   * @param {string} mimeType - MIMEタイプ
   * @returns {string} 拡張子
   */
  getExtensionFromMimeType(mimeType) {
    const mimeMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'application/pdf': 'pdf',
    };
    return mimeMap[mimeType] || 'bin';
  }

  /**
   * LINE画像メッセージをDiscord用に変換
   * @param {Object} message - LINE画像メッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineImage(message) {
    try {
      const content = await this.getLineContent(message.id);
      
      // MIMEタイプをより正確に判定
      let mimeType = message.contentProvider?.type;
      if (!mimeType) {
        // ファイルの先頭バイトからMIMEタイプを推測
        const header = content.slice(0, 4);
        if (header[0] === 0xFF && header[1] === 0xD8) {
          mimeType = 'image/jpeg';
        } else if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
          mimeType = 'image/png';
        } else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
          mimeType = 'image/gif';
        } else {
          mimeType = 'image/jpeg'; // デフォルト
        }
      }
      
      const extension = this.getExtensionFromMimeType(mimeType);
      const filename = `line_image_${message.id}.${extension}`;
      
      const attachment = new AttachmentBuilder(content, { name: filename });
      
      logger.debug('Processed LINE image', { 
        messageId: message.id, 
        mimeType, 
        extension, 
        filename,
        size: content.length 
      });
      
      return {
        content: `**画像**`,
        files: [attachment],
      };
    } catch (error) {
      logger.error('Failed to process LINE image', { messageId: message.id, error: error.message });
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
      const extension = this.getExtensionFromMimeType(message.contentProvider?.type || 'video/mp4');
      const filename = `line_video_${message.id}.${extension}`;
      
      const attachment = new AttachmentBuilder(content, { name: filename });
      
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
      const extension = this.getExtensionFromMimeType(message.contentProvider?.type || 'audio/m4a');
      const filename = `line_audio_${message.id}.${extension}`;
      
      const attachment = new AttachmentBuilder(content, { name: filename });
      
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
      const filename = message.fileName || `line_file_${message.id}.bin`;
      
      const attachment = new AttachmentBuilder(content, { name: filename });
      
      return {
        content: `**ファイル**: ${filename} (${message.fileSize} bytes)`,
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
   * LINEスタンプ情報を取得
   * @param {string} packageId - スタンプパッケージID
   * @param {string} stickerId - スタンプID
   * @returns {Promise<Object>} スタンプ情報
   */
  async getStickerInfo(packageId, stickerId) {
    try {
      // LINE SDKでスタンプ情報を取得（利用可能な場合）
      // 注意: LINE SDKには直接的なスタンプ情報取得APIがないため、
      // 一般的なスタンプURLパターンを使用
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
   * LINEスタンプメッセージをDiscord用に変換（改良版）
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
   * LINEスタンプメッセージをDiscord用に変換（代替方法）
   * @param {Object} message - LINEスタンプメッセージ
   * @returns {Promise<Object>} Discord用のメッセージオブジェクト
   */
  async processLineStickerAlternative(message) {
    try {
      // 複数のスタンプ画像URLパターンを試行
      const urlPatterns = [
        `https://stickershop.line-scdn.net/stickershop/v1/sticker/${message.stickerId}/android/sticker.png`,
        `https://stickershop.line-scdn.net/stickershop/v1/sticker/${message.stickerId}/iPhone/sticker@2x.png`,
        `https://stickershop.line-scdn.net/stickershop/v1/sticker/${message.stickerId}/iPhone/sticker.png`,
        `https://stickershop.line-scdn.net/stickershop/v1/sticker/${message.stickerId}/android/sticker@2x.png`,
      ];

      let content = null;
      let successfulUrl = null;

      for (const url of urlPatterns) {
        try {
          content = await this.downloadFile(url, `sticker_${message.stickerId}.png`);
          successfulUrl = url;
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
        // すべてのURLが失敗した場合
        return {
          content: `**スタンプ** (${message.packageId}/${message.stickerId}) (画像を取得できませんでした)`,
        };
      }
    } catch (error) {
      logger.error('Failed to process LINE sticker (alternative)', { 
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
   * Discord添付ファイルをLINE用に変換
   * @param {Array} attachments - Discord添付ファイル配列
   * @param {string} userId - LINEユーザーID
   * @param {Object} lineService - LINEサービスインスタンス
   * @returns {Promise<Array>} 処理結果の配列
   */
  async processDiscordAttachments(attachments, userId, lineService) {
    const results = [];
    
    for (const attachment of attachments) {
      try {
        const content = await this.downloadFile(attachment.url, attachment.name);
        
        // ファイルサイズチェック（LINE制限: 10MB）
        if (content.length > 10 * 1024 * 1024) {
          await lineService.pushMessage(userId, {
            type: 'text',
            text: `**ファイル**: ${attachment.name} (サイズが大きすぎます - 10MB以下にしてください)`,
          });
          results.push({ success: false, reason: 'file_too_large' });
          continue;
        }

        // ファイルタイプに応じて処理
        if (attachment.contentType?.startsWith('image/')) {
          await lineService.sendImage(userId, content, attachment.name);
          results.push({ success: true, type: 'image', filename: attachment.name });
        } else if (attachment.contentType?.startsWith('video/')) {
          await lineService.sendVideo(userId, content, attachment.name);
          results.push({ success: true, type: 'video', filename: attachment.name });
        } else if (attachment.contentType?.startsWith('audio/')) {
          await lineService.sendAudio(userId, content, attachment.name);
          results.push({ success: true, type: 'audio', filename: attachment.name });
        } else {
          // その他のファイルはURLとして送信
          await lineService.pushMessage(userId, {
            type: 'text',
            text: `**ファイル**: ${attachment.name}\n${attachment.url}`,
          });
          results.push({ success: true, type: 'url', filename: attachment.name });
        }
      } catch (error) {
        logger.error('Failed to process Discord attachment', { 
          attachment: attachment.name, 
          error: error.message 
        });
        await lineService.pushMessage(userId, {
          type: 'text',
          text: `**ファイル**: ${attachment.name} (処理に失敗しました)`,
        });
        results.push({ success: false, reason: 'processing_error', filename: attachment.name });
      }
    }
    
    return results;
  }

  /**
   * URLを検出して埋め込み画像を処理
   * @param {string} text - テキスト
   * @param {string} userId - LINEユーザーID
   * @param {Object} lineService - LINEサービスインスタンス
   * @returns {Promise<Array>} 処理結果の配列
   */
  async processUrls(text, userId, lineService) {
    const results = [];
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    for (const url of urls) {
      try {
        // 画像URLかどうかをチェック
        if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
          const content = await this.downloadFile(url, `image_${Date.now()}.jpg`);
          
          // ファイルサイズチェック（LINE制限: 10MB）
          if (content.length > 10 * 1024 * 1024) {
            await lineService.pushMessage(userId, {
              type: 'text',
              text: `**画像URL**: サイズが大きすぎます - 10MB以下にしてください\n${url}`,
            });
            results.push({ success: false, reason: 'file_too_large', url });
            continue;
          }
          
          await lineService.sendImage(userId, content, `image_${Date.now()}.jpg`);
          results.push({ success: true, type: 'image', url });
        } else if (url.match(/\.(mp4|mov|avi|wmv|flv|webm)$/i)) {
          const content = await this.downloadFile(url, `video_${Date.now()}.mp4`);
          
          // ファイルサイズチェック（LINE制限: 10MB）
          if (content.length > 10 * 1024 * 1024) {
            await lineService.pushMessage(userId, {
              type: 'text',
              text: `**動画URL**: サイズが大きすぎます - 10MB以下にしてください\n${url}`,
            });
            results.push({ success: false, reason: 'file_too_large', url });
            continue;
          }
          
          await lineService.sendVideo(userId, content, `video_${Date.now()}.mp4`);
          results.push({ success: true, type: 'video', url });
        }
      } catch (error) {
        logger.error('Failed to process URL', { url, error: error.message });
        results.push({ success: false, reason: 'download_error', url });
      }
    }
    
    return results;
  }
}

module.exports = MediaService; 