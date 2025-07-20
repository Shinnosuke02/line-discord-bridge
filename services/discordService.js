const logger = require('./logger');

/**
 * Discord関連の処理を専門に扱うクラス
 * メッセージ解析、添付ファイル処理、スタンプ処理を担当
 */
class DiscordService {
  constructor() {
    this.supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    this.supportedVideoTypes = ['video/mp4', 'video/quicktime', 'video/avi', 'video/wmv', 'video/flv', 'video/webm'];
    this.supportedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'];
  }

  /**
   * Discordメッセージを解析
   * @param {Object} message - Discordメッセージ
   * @returns {Object} 解析結果
   */
  parseMessage(message) {
    const result = {
      hasText: false,
      hasAttachments: false,
      hasStickers: false,
      hasUrls: false,
      text: '',
      attachments: [],
      stickers: [],
      urls: [],
      isBot: message.author.bot,
      hasGuild: !!message.guild,
      channelId: message.channel.id,
      authorId: message.author.id,
      authorName: message.author.username
    };

    // テキストメッセージの解析
    if (message.content && message.content.trim()) {
      result.hasText = true;
      result.text = message.content.trim();
      
      // URLの抽出
      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = result.text.match(urlRegex) || [];
      if (urls.length > 0) {
        result.hasUrls = true;
        result.urls = urls;
      }
    }

    // 添付ファイルの解析
    if (message.attachments && message.attachments.size > 0) {
      result.hasAttachments = true;
      result.attachments = Array.from(message.attachments.values()).map(attachment => ({
        id: attachment.id,
        name: attachment.name,
        url: attachment.url,
        contentType: attachment.contentType,
        size: attachment.size,
        height: attachment.height,
        width: attachment.width
      }));
    }

    // スタンプの解析
    if (message.stickers && message.stickers.size > 0) {
      result.hasStickers = true;
      result.stickers = Array.from(message.stickers.values()).map(sticker => ({
        id: sticker.id,
        name: sticker.name,
        description: sticker.description,
        url: sticker.url,
        format: sticker.format
      }));
    }

    logger.debug('Discord message parsed', {
      channelId: result.channelId,
      authorName: result.authorName,
      hasText: result.hasText,
      hasAttachments: result.hasAttachments,
      hasStickers: result.hasStickers,
      hasUrls: result.hasUrls,
      attachmentCount: result.attachments.length,
      stickerCount: result.stickers.length,
      urlCount: result.urls.length
    });

    return result;
  }

  /**
   * 添付ファイルを分類
   * @param {Array} attachments - 添付ファイル配列
   * @returns {Object} 分類結果
   */
  categorizeAttachments(attachments) {
    const categories = {
      images: [],
      videos: [],
      audio: [],
      documents: [],
      unknown: []
    };

    for (const attachment of attachments) {
      const contentType = attachment.contentType || '';
      
      if (this.supportedImageTypes.some(type => contentType.startsWith(type))) {
        categories.images.push(attachment);
      } else if (this.supportedVideoTypes.some(type => contentType.startsWith(type))) {
        categories.videos.push(attachment);
      } else if (this.supportedAudioTypes.some(type => contentType.startsWith(type))) {
        categories.audio.push(attachment);
      } else if (contentType.startsWith('application/') || contentType.startsWith('text/')) {
        categories.documents.push(attachment);
      } else {
        categories.unknown.push(attachment);
      }
    }

    logger.debug('Attachments categorized', {
      total: attachments.length,
      images: categories.images.length,
      videos: categories.videos.length,
      audio: categories.audio.length,
      documents: categories.documents.length,
      unknown: categories.unknown.length
    });

    return categories;
  }

  /**
   * URLを分類
   * @param {Array} urls - URL配列
   * @returns {Object} 分類結果
   */
  categorizeUrls(urls) {
    const categories = {
      images: [],
      videos: [],
      documents: [],
      unknown: []
    };

    for (const url of urls) {
      const lowerUrl = url.toLowerCase();
      
      if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
        categories.images.push(url);
      } else if (lowerUrl.match(/\.(mp4|mov|avi|wmv|flv|webm)$/)) {
        categories.videos.push(url);
      } else if (lowerUrl.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/)) {
        categories.documents.push(url);
      } else {
        categories.unknown.push(url);
      }
    }

    logger.debug('URLs categorized', {
      total: urls.length,
      images: categories.images.length,
      videos: categories.videos.length,
      documents: categories.documents.length,
      unknown: categories.unknown.length
    });

    return categories;
  }

  /**
   * メッセージが有効かどうかを判定
   * @param {Object} message - Discordメッセージ
   * @returns {boolean} 有効かどうか
   */
  isValidMessage(message) {
    // ボットメッセージは無視
    if (message.author.bot) {
      return false;
    }

    // ギルド外メッセージは無視
    if (!message.guild) {
      return false;
    }

    // テキスト、添付ファイル、スタンプのいずれかがある場合のみ有効
    const hasContent = (message.content && message.content.trim()) ||
                      (message.attachments && message.attachments.size > 0) ||
                      (message.stickers && message.stickers.size > 0);

    return hasContent;
  }

  /**
   * メッセージの要約を生成
   * @param {Object} parsedMessage - 解析されたメッセージ
   * @returns {string} 要約
   */
  generateSummary(parsedMessage) {
    const parts = [];

    if (parsedMessage.hasText) {
      const textPreview = parsedMessage.text.length > 50 
        ? parsedMessage.text.substring(0, 50) + '...' 
        : parsedMessage.text;
      parts.push(`Text: "${textPreview}"`);
    }

    if (parsedMessage.hasAttachments) {
      parts.push(`${parsedMessage.attachments.length} attachment(s)`);
    }

    if (parsedMessage.hasStickers) {
      parts.push(`${parsedMessage.stickers.length} sticker(s)`);
    }

    if (parsedMessage.hasUrls) {
      parts.push(`${parsedMessage.urls.length} URL(s)`);
    }

    return parts.join(', ');
  }
}

module.exports = DiscordService; 