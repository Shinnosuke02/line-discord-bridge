/**
 * LINEリプライ処理サービス
 * LINEメッセージのリプライ機能を処理
 */
const logger = require('../utils/logger');

class LineReplyService {
  constructor(replyManager) {
    this.replyManager = replyManager;
  }

  /**
   * LINEメッセージにリプライ情報があるかチェック
   * @param {Object} event - LINEイベント
   * @returns {boolean} リプライ情報があるかどうか
   */
  hasReply(event) {
    try {
      // LINEのリプライ機能はreplyTokenを使用
      // また、メッセージのreplyTokenが存在する場合はリプライとして扱う
      return !!(event.replyToken && event.message && event.message.id);
    } catch (error) {
      logger.error('Failed to check LINE reply info', error);
      return false;
    }
  }

  /**
   * LINEリプライ用のメッセージを生成
   * @param {string} userId - LINEユーザーID
   * @param {string} replyText - リプライテキスト
   * @param {string} originalMessageId - 元のメッセージID
   * @returns {Object} LINEリプライメッセージ
   */
  generateReplyMessage(userId, replyText, originalMessageId) {
    try {
      // LINEのリプライ機能は限定的なため、
      // テキストメッセージとして送信し、リプライ情報をコメントで追加
      const replyPrefix = `↩️ 返信: ${originalMessageId}`;
      const fullText = `${replyPrefix}\n${replyText}`;

      return {
        type: 'text',
        text: fullText
      };
    } catch (error) {
      logger.error('Failed to generate LINE reply message', error);
      return {
        type: 'text',
        text: replyText
      };
    }
  }

  /**
   * リプライメッセージを処理
   * @param {Object} event - LINEイベント
   * @param {string} replyText - リプライテキスト
   * @returns {Promise<Object>} 処理結果
   */
  async processReplyMessage(event, replyText) {
    try {
      if (!this.hasReply(event)) {
        return {
          isReply: false,
          message: {
            type: 'text',
            text: replyText
          }
        };
      }

      // リプライ関係を記録
      this.replyManager.addReplyMapping(
        event.message.id,
        event.replyToken, // LINEの場合はreplyTokenを元メッセージIDとして使用
        'line'
      );

      const replyMessage = this.generateReplyMessage(
        event.source.userId,
        replyText,
        event.replyToken
      );

      logger.info('LINE reply message processed', {
        messageId: event.message.id,
        replyToken: event.replyToken,
        userId: event.source.userId
      });

      return {
        isReply: true,
        message: replyMessage
      };
    } catch (error) {
      logger.error('Failed to process LINE reply message', {
        messageId: event.message.id,
        error: error.message
      });
      
      // エラー時は通常のメッセージとして処理
      return {
        isReply: false,
        message: {
          type: 'text',
          text: replyText
        }
      };
    }
  }

  /**
   * DiscordメッセージからLINEリプライ用のメッセージを生成
   * @param {Object} discordMessage - Discordメッセージ
   * @param {string} originalLineMessageId - 元のLINEメッセージID
   * @returns {Object} LINEリプライメッセージ
   */
  generateDiscordReplyMessage(discordMessage, originalLineMessageId) {
    try {
      let content = discordMessage.content || '';
      
      // 添付ファイルがある場合の処理
      if (discordMessage.attachments && discordMessage.attachments.size > 0) {
        const attachmentNames = Array.from(discordMessage.attachments.values())
          .map(att => att.name)
          .join(', ');
        content += `\n[添付ファイル: ${attachmentNames}]`;
      }

      // 埋め込みメッセージがある場合の処理
      if (discordMessage.embeds && discordMessage.embeds.length > 0) {
        const embedTitles = discordMessage.embeds
          .map(embed => embed.title || 'タイトルなし')
          .join(', ');
        content += `\n[埋め込み: ${embedTitles}]`;
      }

      const replyPrefix = `↩️ 返信: ${originalLineMessageId}`;
      const fullText = `${replyPrefix}\n${content}`;

      return {
        type: 'text',
        text: fullText
      };
    } catch (error) {
      logger.error('Failed to generate Discord reply message for LINE', error);
      return {
        type: 'text',
        text: discordMessage.content || ''
      };
    }
  }

  /**
   * リプライ機能が利用可能かチェック
   * @returns {boolean} リプライ機能が利用可能かどうか
   */
  isAvailable() {
    try {
      return this.replyManager && this.replyManager.isReplyEnabled();
    } catch (error) {
      logger.error('Failed to check LINE reply availability', error);
      return false;
    }
  }
}

module.exports = LineReplyService;
