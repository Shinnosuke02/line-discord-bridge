/**
 * Discordリプライ処理サービス
 * Discordメッセージのリプライ機能を処理
 */
const logger = require('../utils/logger');

class DiscordReplyService {
  constructor(replyManager) {
    this.replyManager = replyManager;
  }

  /**
   * Discordメッセージにリプライ情報があるかチェック
   * @param {Object} message - Discordメッセージ
   * @returns {boolean} リプライ情報があるかどうか
   */
  hasReply(message) {
    try {
      return !!(message.reference && message.reference.messageId);
    } catch (error) {
      logger.error('Failed to check reply info', error);
      return false;
    }
  }

  /**
   * Discordメッセージのリプライ情報を取得
   * @param {Object} message - Discordメッセージ
   * @returns {Object|null} リプライ情報
   */
  getReplyInfo(message) {
    try {
      if (!this.hasReply(message)) {
        return null;
      }

      return {
        messageId: message.reference.messageId,
        channelId: message.reference.channelId,
        guildId: message.reference.guildId,
        isReply: true
      };
    } catch (error) {
      logger.error('Failed to get reply info', error);
      return null;
    }
  }

  /**
   * リプライ先のメッセージを取得
   * @param {Object} message - Discordメッセージ
   * @returns {Promise<Object|null>} リプライ先のメッセージ
   */
  async getRepliedMessage(message) {
    try {
      if (!this.hasReply(message)) {
        return null;
      }

      const replyInfo = this.getReplyInfo(message);
      if (!replyInfo) {
        return null;
      }

      // チャンネルからメッセージを取得
      const channel = message.channel;
      if (!channel) {
        logger.warn('Channel not found for reply message', {
          messageId: message.id,
          channelId: replyInfo.channelId
        });
        return null;
      }

      const repliedMessage = await channel.messages.fetch(replyInfo.messageId);
      return repliedMessage;
    } catch (error) {
      logger.error('Failed to get replied message', {
        messageId: message.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * リプライ用のメッセージテキストを生成
   * @param {Object} message - Discordメッセージ
   * @param {Object} repliedMessage - リプライ先のメッセージ
   * @returns {string} リプライ用テキスト
   */
  generateReplyText(message, repliedMessage) {
    try {
      if (!repliedMessage) {
        return message.content || '';
      }

      // リプライ先のメッセージの内容を取得
      let repliedContent = '';
      if (repliedMessage.content) {
        repliedContent = repliedMessage.content;
      } else if (repliedMessage.attachments && repliedMessage.attachments.size > 0) {
        repliedContent = `[添付ファイル: ${repliedMessage.attachments.first().name}]`;
      } else if (repliedMessage.embeds && repliedMessage.embeds.length > 0) {
        repliedContent = `[埋め込みメッセージ: ${repliedMessage.embeds[0].title || 'タイトルなし'}]`;
      } else {
        repliedContent = '[メッセージ]';
      }

      // リプライ先の内容を短縮（100文字以内）
      if (repliedContent.length > 100) {
        repliedContent = repliedContent.substring(0, 97) + '...';
      }

      // リプライ用のテキストを生成
      const replyPrefix = `↩️ ${repliedMessage.author.username}: ${repliedContent}`;
      const currentContent = message.content || '';

      return `${replyPrefix}\n${currentContent}`;
    } catch (error) {
      logger.error('Failed to generate reply text', error);
      return message.content || '';
    }
  }

  /**
   * リプライメッセージを処理
   * @param {Object} message - Discordメッセージ
   * @returns {Promise<Object>} 処理結果
   */
  async processReplyMessage(message) {
    try {
      if (!this.hasReply(message)) {
        return {
          isReply: false,
          originalMessage: null,
          replyText: message.content || ''
        };
      }

      const repliedMessage = await this.getRepliedMessage(message);
      if (!repliedMessage) {
        logger.warn('Could not fetch replied message', {
          messageId: message.id,
          replyMessageId: message.reference.messageId
        });
        return {
          isReply: false,
          originalMessage: null,
          replyText: message.content || ''
        };
      }

      const replyText = this.generateReplyText(message, repliedMessage);

      // リプライ関係を記録
      this.replyManager.addReplyMapping(
        message.id,
        message.reference.messageId,
        'discord'
      );

      logger.info('Reply message processed', {
        messageId: message.id,
        repliedMessageId: message.reference.messageId,
        authorId: message.author.id,
        channelId: message.channel.id
      });

      return {
        isReply: true,
        originalMessage: repliedMessage,
        replyText: replyText
      };
    } catch (error) {
      logger.error('Failed to process reply message', {
        messageId: message.id,
        error: error.message
      });
      
      // エラー時は通常のメッセージとして処理
      return {
        isReply: false,
        originalMessage: null,
        replyText: message.content || ''
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
      logger.error('Failed to check reply availability', error);
      return false;
    }
  }
}

module.exports = DiscordReplyService;
