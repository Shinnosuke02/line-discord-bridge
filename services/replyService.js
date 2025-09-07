const logger = require('../utils/logger');

/**
 * 返信機能サービス
 * LINEとDiscord間の返信機能を管理
 */
class ReplyService {
  constructor(messageMappingManager, lineService, discordService) {
    this.messageMappingManager = messageMappingManager;
    this.lineService = lineService;
    this.discordService = discordService;
  }

  /**
   * Discordメッセージの返信を処理
   * @param {Object} message - Discordメッセージ
   * @param {string} lineUserId - LINEユーザーID
   */
  async handleDiscordReply(message, lineUserId) {
    try {
      // 返信先のメッセージを取得
      const referencedMessage = message.reference?.messageId ? 
        await message.channel.messages.fetch(message.reference.messageId) : null;

      if (!referencedMessage) {
        logger.debug('No referenced message found for Discord reply');
        return;
      }

      // 返信先のDiscordメッセージに対応するLINEメッセージIDを取得
      const originalLineMessageId = this.messageMappingManager.getLineMessageId(referencedMessage.id);
      
      if (!originalLineMessageId) {
        logger.debug('No LINE message mapping found for referenced Discord message', {
          discordMessageId: referencedMessage.id
        });
        return;
      }

      // 返信関係を記録
      await this.messageMappingManager.recordReply(
        originalLineMessageId,
        message.id,
        'discord'
      );

      // LINEに返信メッセージを送信
      const replyContent = this.formatDiscordReplyForLine(message, referencedMessage);
      
      await this.lineService.pushMessage(lineUserId, {
        type: 'text',
        text: replyContent
      });

      logger.info('Discord reply forwarded to LINE', {
        discordMessageId: message.id,
        originalLineMessageId,
        lineUserId,
        replyContent: replyContent.substring(0, 100)
      });

    } catch (error) {
      logger.error('Failed to handle Discord reply', {
        messageId: message.id,
        lineUserId,
        error: error.message
      });
    }
  }

  /**
   * LINEメッセージの返信を処理
   * @param {Object} event - LINEイベント
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async handleLineReply(event, discordChannelId) {
    try {
      // LINEの返信機能は限定的なので、通常のメッセージとして処理
      // 将来的にLINEの返信機能が拡張された場合の拡張ポイント
      
      // メッセージIDをマッピングに記録
      await this.messageMappingManager.mapLineToDiscord(
        event.message.id,
        null, // DiscordメッセージIDは後で設定
        event.source.userId,
        discordChannelId
      );

      logger.debug('LINE message prepared for Discord mapping', {
        lineMessageId: event.message.id,
        discordChannelId
      });

    } catch (error) {
      logger.error('Failed to handle LINE reply', {
        lineMessageId: event.message.id,
        discordChannelId,
        error: error.message
      });
    }
  }

  /**
   * Discord返信をLINE用にフォーマット
   * @param {Object} replyMessage - 返信メッセージ
   * @param {Object} originalMessage - 元のメッセージ
   * @returns {string} フォーマットされたメッセージ
   */
  formatDiscordReplyForLine(replyMessage, originalMessage) {
    const authorName = replyMessage.author.username;
    const replyText = replyMessage.content || '返信メッセージ';
    
    // 元のメッセージの要約を作成
    const originalSummary = this.createMessageSummary(originalMessage);
    
    return `↩️ 返信: ${originalSummary}\n${authorName}: ${replyText}`;
  }

  /**
   * メッセージの要約を作成
   * @param {Object} message - メッセージ
   * @returns {string} 要約
   */
  createMessageSummary(message) {
    if (message.content) {
      const preview = message.content.length > 50 
        ? message.content.substring(0, 50) + '...'
        : message.content;
      return `"${preview}"`;
    } else if (message.attachments && message.attachments.size > 0) {
      return `添付ファイル (${message.attachments.size}件)`;
    } else if (message.stickers && message.stickers.size > 0) {
      return `スタンプ (${message.stickers.size}件)`;
    } else {
      return 'メッセージ';
    }
  }

  /**
   * Discordメッセージ送信後にマッピングを更新
   * @param {string} lineMessageId - LINEメッセージID
   * @param {string} discordMessageId - DiscordメッセージID
   * @param {string} lineUserId - LINEユーザーID
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async updateDiscordMapping(lineMessageId, discordMessageId, lineUserId, discordChannelId) {
    try {
      // 既存のマッピングを更新
      const mapping = this.messageMappingManager.mappings.find(m => 
        m.lineMessageId === lineMessageId && m.direction === 'line_to_discord'
      );

      if (mapping) {
        mapping.discordMessageId = discordMessageId;
        await this.messageMappingManager.saveMappings();
        
        logger.debug('Discord mapping updated', {
          lineMessageId,
          discordMessageId,
          lineUserId,
          discordChannelId
        });
      }
    } catch (error) {
      logger.error('Failed to update Discord mapping', {
        lineMessageId,
        discordMessageId,
        error: error.message
      });
    }
  }

  /**
   * 返信機能の統計を取得
   */
  getReplyStats() {
    const stats = this.messageMappingManager.getStats();
    return {
      ...stats,
      totalReplies: stats.replyMappings
    };
  }
}

module.exports = ReplyService;
