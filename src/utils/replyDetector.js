/**
 * リプライ検出ユーティリティ
 * LINEとDiscord間のリプライ機能を改善
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */

/**
 * LINEリプライ検出クラス
 */
class LineReplyDetector {
  constructor() {
    // リプライメッセージのパターン
    this.replyPatterns = [
      /↩️\s*返信:\s*(.+)/,
      /💬\s*返信:\s*(.+)/,
      /返信:\s*(.+)/,
      /reply:\s*(.+)/i,
      /RE:\s*(.+)/i,
      /【返信】\s*(.+)/,
      /\[返信\]\s*(.+)/
    ];
    
    // メッセージID抽出パターン
    this.messageIdPatterns = [
      /ID:([a-zA-Z0-9\-_]+)/,
      /MsgID:([a-zA-Z0-9\-_]+)/,
      /MID:([a-zA-Z0-9\-_]+)/,
      /メッセージID:([a-zA-Z0-9\-_]+)/,
      /msg_id:([a-zA-Z0-9\-_]+)/
    ];
  }

  /**
   * リプライメッセージかどうかを判定
   * @param {string} messageText - メッセージテキスト
   * @returns {boolean} リプライメッセージかどうか
   */
  isReplyMessage(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return false;
    }

    return this.replyPatterns.some(pattern => pattern.test(messageText));
  }

  /**
   * 元のメッセージIDを抽出
   * @param {string} messageText - メッセージテキスト
   * @returns {string|null} 元のメッセージID
   */
  extractOriginalMessageId(messageText) {
    if (!messageText) return null;

    for (const pattern of this.messageIdPatterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 返信メッセージから実際の内容を抽出
   * @param {string} messageText - メッセージテキスト
   * @returns {string|null} 実際の返信内容
   */
  extractReplyContent(messageText) {
    if (!messageText) return null;

    for (const pattern of this.replyPatterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        // メッセージID部分を除去
        let content = match[1];
        for (const idPattern of this.messageIdPatterns) {
          content = content.replace(idPattern, '').trim();
        }
        return content || null;
      }
    }

    return null;
  }

  /**
   * 返信メッセージの詳細情報を解析
   * @param {string} messageText - メッセージテキスト
   * @returns {Object|null} 解析結果
   */
  parseReplyMessage(messageText) {
    if (!this.isReplyMessage(messageText)) {
      return null;
    }

    return {
      isReply: true,
      originalMessageId: this.extractOriginalMessageId(messageText),
      replyContent: this.extractReplyContent(messageText),
      fullText: messageText
    };
  }
}

/**
 * Discordリプライ検出クラス
 */
class DiscordReplyDetector {
  constructor() {
    // Discordのリプライメッセージ形式
    this.replyFormats = [
      /^> (.+)$/m,  // Quote format
      /^```\n(.+)\n```$/s,  // Code block format
      /^「(.+)」$/,  // Japanese quote format
      /^"(.*)"$/  // Quote format
    ];
  }

  /**
   * Discordメッセージがリプライかどうかを判定
   * @param {Object} message - Discordメッセージオブジェクト
   * @returns {boolean} リプライかどうか
   */
  isReplyMessage(message) {
    if (!message) return false;
    
    // Discordのネイティブリプライ機能
    if (message.reference && message.reference.messageId) {
      return true;
    }

    // テキストベースのリプライ検出
    if (message.content) {
      return this.replyFormats.some(format => format.test(message.content));
    }

    return false;
  }

  /**
   * リプライ情報を取得
   * @param {Object} message - Discordメッセージオブジェクト
   * @returns {Object|null} リプライ情報
   */
  getReplyInfo(message) {
    if (!this.isReplyMessage(message)) {
      return null;
    }

    return {
      isReply: true,
      referenceMessageId: message.reference?.messageId || null,
      replyContent: message.content,
      author: message.author,
      timestamp: message.createdAt
    };
  }
}

/**
 * リプライメッセージフォーマッター
 */
class ReplyFormatter {
  constructor() {
    this.lineReplyPrefix = '↩️ 返信';
    this.discordReplyPrefix = '💬 返信';
  }

  /**
   * DiscordリプライをLINE形式にフォーマット
   * @param {Object} replyInfo - リプライ情報
   * @param {string} originalContent - 元のメッセージ内容
   * @returns {string} フォーマットされたメッセージ
   */
  formatDiscordReplyForLine(replyInfo, originalContent) {
    const author = replyInfo.author?.username || 'Unknown';
    const replyContent = replyInfo.replyContent || '';
    
    return `${this.lineReplyPrefix}: ${originalContent}\n\n${author}: ${replyContent}`;
  }

  /**
   * LINEリプライをDiscord形式にフォーマット
   * @param {Object} replyInfo - リプライ情報
   * @param {string} originalContent - 元のメッセージ内容
   * @returns {string} フォーマットされたメッセージ
   */
  formatLineReplyForDiscord(replyInfo, originalContent) {
    const replyContent = replyInfo.replyContent || '';
    
    return `${this.discordReplyPrefix}: ${originalContent}\n\n${replyContent}`;
  }

  /**
   * リプライメッセージにメッセージIDを埋め込む
   * @param {string} content - メッセージ内容
   * @param {string} messageId - メッセージID
   * @returns {string} ID埋め込み済みメッセージ
   */
  embedMessageId(content, messageId) {
    return `${content} [ID:${messageId}]`;
  }
}

module.exports = {
  LineReplyDetector,
  DiscordReplyDetector,
  ReplyFormatter
};
