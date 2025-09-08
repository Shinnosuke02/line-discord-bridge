/**
 * 返信サービス
 * LINEとDiscord間の返信機能を管理
 */
const logger = require('../utils/logger');

/**
 * 返信サービスクラス
 */
class ReplyService {
  constructor(messageMappingManager, lineService, discordClient) {
    this.messageMappingManager = messageMappingManager;
    this.lineService = lineService;
    this.discord = discordClient;
  }

  /**
   * Discord返信を処理
   * @param {Object} message - Discordメッセージ
   * @param {string} lineUserId - LINEユーザーID
   */
  async handleDiscordReply(message, lineUserId) {
    try {
      if (!message.reference?.messageId) {
        return;
      }

      const originalMessageId = message.reference.messageId;
      const lineMessageId = this.messageMappingManager.getLineMessageIdForDiscordReply(originalMessageId);

      if (!lineMessageId) {
        logger.warn('No LINE message found for Discord reply', {
          discordMessageId: originalMessageId,
          replyMessageId: message.id
        });
        return;
      }

      // 返信メッセージをLINEに送信
      const replyText = this.formatDiscordReply(message, lineMessageId);
      await this.lineService.pushMessage(lineUserId, {
        type: 'text',
        text: replyText
      });

      logger.info('Discord reply forwarded to LINE', {
        originalDiscordMessageId: originalMessageId,
        replyDiscordMessageId: message.id,
        lineMessageId,
        lineUserId
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
   * LINE返信を処理
   * @param {Object} event - LINEイベント
   * @param {string} discordChannelId - DiscordチャンネルID
   */
  async handleLineReply(event, discordChannelId) {
    try {
      if (event.type !== 'message' || event.message.type !== 'text') {
        return;
      }

      // 返信メッセージの検出（簡単な実装）
      const messageText = event.message.text;
      if (!this.isReplyMessage(messageText)) {
        return;
      }

      // 元のメッセージIDを抽出
      const originalMessageId = this.extractOriginalMessageId(messageText);
      if (!originalMessageId) {
        return;
      }

      const discordMessageId = this.messageMappingManager.getDiscordMessageIdForLineReply(originalMessageId);
      if (!discordMessageId) {
        logger.warn('No Discord message found for LINE reply', {
          lineMessageId: originalMessageId,
          replyLineMessageId: event.message.id
        });
        return;
      }

      // 返信メッセージをDiscordに送信
      const replyText = this.formatLineReply(event, discordMessageId);
      const channel = await this.discord.channels.fetch(discordChannelId);
      const originalMessage = await channel.messages.fetch(discordMessageId);
      
      await originalMessage.reply({
        content: replyText
      });

      logger.info('LINE reply forwarded to Discord', {
        originalLineMessageId: originalMessageId,
        replyLineMessageId: event.message.id,
        discordMessageId,
        discordChannelId
      });

    } catch (error) {
      logger.error('Failed to handle LINE reply', {
        eventId: event.message?.id,
        discordChannelId,
        error: error.message
      });
    }
  }

  /**
   * Discord返信メッセージをフォーマット
   * @param {Object} message - Discordメッセージ
   * @param {string} lineMessageId - LINEメッセージID
   * @returns {string} フォーマットされた返信メッセージ
   */
  formatDiscordReply(message, lineMessageId) {
    const author = message.author.username;
    const content = message.content || '返信メッセージ';
    
    return `💬 ${author} からの返信 (ID:${lineMessageId}):\n${content}`;
  }

  /**
   * LINE返信メッセージをフォーマット
   * @param {Object} event - LINEイベント
   * @param {string} discordMessageId - DiscordメッセージID
   * @returns {string} フォーマットされた返信メッセージ
   */
  formatLineReply(event, discordMessageId) {
    const displayName = event.source.userId; // 実際の実装では表示名を取得
    const content = event.message.text;
    
    return `💬 ${displayName} からの返信 (ID:${discordMessageId}):\n${content}`;
  }

  /**
   * 返信メッセージかどうかを判定
   * @param {string} messageText - メッセージテキスト
   * @returns {boolean} 返信メッセージかどうか
   */
  isReplyMessage(messageText) {
    // LINEの返信メッセージパターンを検出
    return messageText.includes('↩️ 返信:') || 
           messageText.includes('💬') ||
           messageText.includes('返信:') ||
           messageText.includes('reply:');
  }

  /**
   * 元のメッセージIDを抽出
   * @param {string} messageText - メッセージテキスト
   * @returns {string|null} 元のメッセージID
   */
  extractOriginalMessageId(messageText) {
    // 返信メッセージから元のメッセージIDを抽出
    const patterns = [
      /ID:([a-zA-Z0-9]+)/,
      /返信:.*?ID:([a-zA-Z0-9]+)/,
      /💬.*?ID:([a-zA-Z0-9]+)/,
      /reply:.*?ID:([a-zA-Z0-9]+)/
    ];
    
    for (const pattern of patterns) {
      const match = messageText.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * 返信チェーンを構築
   * @param {string} messageId - メッセージID
   * @param {string} platform - プラットフォーム ('line' または 'discord')
   * @returns {Array} 返信チェーン
   */
  async buildReplyChain(messageId, platform) {
    try {
      const chain = [];
      let currentMessageId = messageId;
      let currentPlatform = platform;

      // 最大10回の返信チェーンを追跡
      for (let i = 0; i < 10; i++) {
        let nextMessageId = null;
        let nextPlatform = null;

        if (currentPlatform === 'line') {
          nextMessageId = this.messageMappingManager.getDiscordMessageIdForLineReply(currentMessageId);
          nextPlatform = 'discord';
        } else {
          nextMessageId = this.messageMappingManager.getLineMessageIdForDiscordReply(currentMessageId);
          nextPlatform = 'line';
        }

        if (!nextMessageId) {
          break;
        }

        chain.push({
          messageId: currentMessageId,
          platform: currentPlatform,
          nextMessageId,
          nextPlatform
        });

        currentMessageId = nextMessageId;
        currentPlatform = nextPlatform;
      }

      return chain;
    } catch (error) {
      logger.error('Failed to build reply chain', {
        messageId,
        platform,
        error: error.message
      });
      return [];
    }
  }

  /**
   * 返信統計を取得
   * @returns {Object} 返信統計
   */
  getReplyStats() {
    try {
      const mappings = this.messageMappingManager.getAllMappings();
      
      // 返信チェーンの分析
      const lineToDiscordMappings = mappings.lineToDiscord;
      const discordToLineMappings = mappings.discordToLine;
      
      const totalMappings = lineToDiscordMappings.length + discordToLineMappings.length;
      const replyChains = this.analyzeReplyChains(mappings);
      
      return {
        totalMappings,
        lineToDiscordCount: lineToDiscordMappings.length,
        discordToLineCount: discordToLineMappings.length,
        replyChains: replyChains.length,
        averageChainLength: replyChains.length > 0 ? 
          replyChains.reduce((sum, chain) => sum + chain.length, 0) / replyChains.length : 0
      };
    } catch (error) {
      logger.error('Failed to get reply stats', {
        error: error.message
      });
      return {
        totalMappings: 0,
        lineToDiscordCount: 0,
        discordToLineCount: 0,
        replyChains: 0,
        averageChainLength: 0
      };
    }
  }

  /**
   * 返信チェーンを分析
   * @param {Object} mappings - マッピング情報
   * @returns {Array} 返信チェーン配列
   */
  analyzeReplyChains(mappings) {
    const chains = [];
    const processed = new Set();

    // LINE to Discord マッピングから開始
    for (const mapping of mappings.lineToDiscord) {
      if (processed.has(mapping.lineMessageId)) {
        continue;
      }

      const chain = this.buildChainFromMapping(mapping, mappings, processed);
      if (chain.length > 1) {
        chains.push(chain);
      }
    }

    return chains;
  }

  /**
   * マッピングからチェーンを構築
   * @param {Object} mapping - マッピング
   * @param {Object} mappings - 全マッピング
   * @param {Set} processed - 処理済みメッセージID
   * @returns {Array} チェーン
   */
  buildChainFromMapping(mapping, mappings, processed) {
    const chain = [];
    let currentMapping = mapping;
    let isLineToDiscord = true;

    while (currentMapping && !processed.has(currentMapping.lineMessageId || currentMapping.discordMessageId)) {
      const messageId = isLineToDiscord ? currentMapping.lineMessageId : currentMapping.discordMessageId;
      processed.add(messageId);

      chain.push({
        messageId,
        platform: isLineToDiscord ? 'line' : 'discord',
        timestamp: currentMapping.timestamp
      });

      // 次のマッピングを検索
      if (isLineToDiscord) {
        const nextMapping = mappings.discordToLine.find(m => m.discordMessageId === currentMapping.discordMessageId);
        currentMapping = nextMapping;
        isLineToDiscord = false;
      } else {
        const nextMapping = mappings.lineToDiscord.find(m => m.lineMessageId === currentMapping.lineMessageId);
        currentMapping = nextMapping;
        isLineToDiscord = true;
      }
    }

    return chain;
  }
}

module.exports = ReplyService;
