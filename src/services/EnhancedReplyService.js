/**
 * 強化された返信サービス
 * LINEとDiscord間の返信機能を改善
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const logger = require('../utils/logger');
const { LineReplyDetector, DiscordReplyDetector, ReplyFormatter } = require('../utils/replyDetector');

/**
 * 強化された返信サービスクラス
 */
class EnhancedReplyService {
  constructor(messageMappingManager, lineService, discordClient) {
    this.messageMappingManager = messageMappingManager;
    this.lineService = lineService;
    this.discord = discordClient;
    
    // リプライ検出器を初期化
    this.lineReplyDetector = new LineReplyDetector();
    this.discordReplyDetector = new DiscordReplyDetector();
    this.replyFormatter = new ReplyFormatter();
    
    // リプライ統計
    this.replyStats = {
      discordToLine: 0,
      lineToDiscord: 0,
      failed: 0,
      lastReset: Date.now()
    };
  }

  /**
   * Discord返信を処理（改善版）
   * @param {Object} message - Discordメッセージ
   * @param {string} lineUserId - LINEユーザーID
   */
  async handleDiscordReply(message, lineUserId) {
    try {
      logger.debug('Processing Discord reply', {
        messageId: message.id,
        hasReference: !!message.reference,
        content: message.content?.substring(0, 100)
      });

      const replyInfo = this.discordReplyDetector.getReplyInfo(message);
      if (!replyInfo) {
        logger.debug('No reply detected in Discord message');
        return;
      }

      // 元のメッセージIDを取得
      const originalMessageId = replyInfo.referenceMessageId;
      if (!originalMessageId) {
        logger.warn('No reference message ID found in Discord reply');
        return;
      }

      // LINEメッセージIDを検索
      const lineMessageId = this.messageMappingManager.getLineMessageIdForDiscordReply(originalMessageId);
      if (!lineMessageId) {
        logger.warn('No LINE message found for Discord reply', {
          discordMessageId: originalMessageId,
          replyMessageId: message.id
        });
        return;
      }

      // 元のLINEメッセージの内容を取得（可能であれば）
      const originalContent = await this.getOriginalMessageContent(originalMessageId, 'discord');
      
      // 返信メッセージをフォーマット
      const replyText = this.replyFormatter.formatDiscordReplyForLine(
        replyInfo, 
        originalContent || `メッセージ (ID:${lineMessageId})`
      );

      // LINEに送信
      await this.lineService.pushMessage(lineUserId, {
        type: 'text',
        text: this.replyFormatter.embedMessageId(replyText, message.id)
      });

      this.replyStats.discordToLine++;
      
      logger.info('Discord reply forwarded to LINE', {
        originalDiscordMessageId: originalMessageId,
        replyDiscordMessageId: message.id,
        lineMessageId,
        lineUserId,
        stats: this.replyStats
      });

    } catch (error) {
      this.replyStats.failed++;
      logger.error('Failed to handle Discord reply', {
        messageId: message.id,
        lineUserId,
        error: error.message,
        stats: this.replyStats
      });
    }
  }

  /**
   * LINE返信を処理（改善版）
   * @param {Object} event - LINEイベント
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async handleLineReply(event, discordChannelId) {
    try {
      logger.debug('Processing LINE reply', {
        eventId: event.message?.id,
        messageType: event.message?.type,
        content: event.message?.text?.substring(0, 100)
      });

      if (event.type !== 'message' || event.message.type !== 'text') {
        logger.debug('Not a text message, skipping reply check');
        return;
      }

      const messageText = event.message.text;
      const replyInfo = this.lineReplyDetector.parseReplyMessage(messageText);
      
      if (!replyInfo) {
        logger.debug('No reply detected in LINE message');
        return;
      }

      const originalMessageId = replyInfo.originalMessageId;
      if (!originalMessageId) {
        logger.debug('Could not extract original message ID from LINE reply');
        return;
      }

      // DiscordメッセージIDを検索
      const discordMessageId = this.messageMappingManager.getDiscordMessageIdForLineReply(originalMessageId);
      if (!discordMessageId) {
        logger.warn('No Discord message found for LINE reply', {
          lineMessageId: originalMessageId,
          replyLineMessageId: event.message.id
        });
        return;
      }

      // 元のDiscordメッセージの内容を取得
      const originalContent = await this.getOriginalMessageContent(discordMessageId, 'discord');
      
      // 返信メッセージをフォーマット
      const replyText = this.replyFormatter.formatLineReplyForDiscord(
        replyInfo,
        originalContent || `メッセージ (ID:${discordMessageId})`
      );

      // Discordに送信
      const channel = await this.discord.channels.fetch(discordChannelId);
      const originalMessage = await channel.messages.fetch(discordMessageId);
      
      await originalMessage.reply({
        content: replyText
      });

      this.replyStats.lineToDiscord++;

      logger.info('LINE reply forwarded to Discord', {
        originalLineMessageId: originalMessageId,
        replyLineMessageId: event.message.id,
        discordMessageId,
        discordChannelId,
        stats: this.replyStats
      });

    } catch (error) {
      this.replyStats.failed++;
      logger.error('Failed to handle LINE reply', {
        eventId: event.message?.id,
        discordChannelId,
        error: error.message,
        stats: this.replyStats
      });
    }
  }

  /**
   * 元のメッセージの内容を取得
   * @param {string} messageId - メッセージID
   * @param {string} platform - プラットフォーム ('line' または 'discord')
   * @returns {Promise<string|null>} メッセージ内容
   */
  async getOriginalMessageContent(messageId, platform) {
    try {
      if (platform === 'discord') {
        // Discordメッセージの内容を取得（キャッシュから）
        const mapping = this.messageMappingManager.getDiscordToLineMapping(messageId);
        return mapping?.content || null;
      } else if (platform === 'line') {
        // LINEメッセージの内容を取得（キャッシュから）
        const mapping = this.messageMappingManager.getLineToDiscordMapping(messageId);
        return mapping?.content || null;
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get original message content', {
        messageId,
        platform,
        error: error.message
      });
      return null;
    }
  }

  /**
   * リプライ統計を取得
   * @returns {Object} リプライ統計
   */
  getReplyStats() {
    const uptime = Date.now() - this.replyStats.lastReset;
    
    return {
      ...this.replyStats,
      uptime,
      successRate: this.replyStats.failed > 0 ? 
        (this.replyStats.discordToLine + this.replyStats.lineToDiscord) / 
        (this.replyStats.discordToLine + this.replyStats.lineToDiscord + this.replyStats.failed) : 1.0,
      totalReplies: this.replyStats.discordToLine + this.replyStats.lineToDiscord
    };
  }

  /**
   * 統計をリセット
   */
  resetStats() {
    this.replyStats = {
      discordToLine: 0,
      lineToDiscord: 0,
      failed: 0,
      lastReset: Date.now()
    };
    
    logger.info('Reply statistics reset');
  }

  /**
   * リプライ機能のヘルスチェック
   * @returns {Object} ヘルスチェック結果
   */
  async healthCheck() {
    try {
      // 基本的な機能テスト
      const testMessage = '↩️ 返信: テストメッセージ [ID:test123]';
      const isReply = this.lineReplyDetector.isReplyMessage(testMessage);
      const messageId = this.lineReplyDetector.extractOriginalMessageId(testMessage);
      
      return {
        status: 'healthy',
        lineReplyDetector: isReply && messageId === 'test123',
        discordReplyDetector: true, // Discord検出器は常に利用可能
        messageMappingManager: !!this.messageMappingManager,
        lineService: !!this.lineService,
        discordClient: !!this.discord,
        stats: this.getReplyStats()
      };
    } catch (error) {
      logger.error('Reply service health check failed', {
        error: error.message
      });
      return {
        status: 'unhealthy',
        error: error.message,
        stats: this.getReplyStats()
      };
    }
  }
}

module.exports = EnhancedReplyService;
