const logger = require('../utils/logger');

class ReplyBridgeFeature {
  constructor({ messageMappingManager } = {}) {
    this.messageMappingManager = messageMappingManager;
  }

  getName() {
    return 'reply-bridge';
  }

  requiresDirectLineTracking() {
    return true;
  }

  async resolveDiscordSendOptions(event) {
    const quotedLineMessageId = event.message?.quotedMessageId;
    if (!quotedLineMessageId) {
      return {};
    }

    const discordOriginMapping = this.messageMappingManager.getDiscordOriginByLineMessageId(quotedLineMessageId);
    if (!discordOriginMapping?.discordMessageId) {
      logger.debug('No Discord origin mapping found for LINE reply target', {
        quotedLineMessageId,
        currentLineMessageId: event.message?.id
      });
      return {};
    }

    return {
      replyToMessageId: discordOriginMapping.discordMessageId
    };
  }

  async resolveLineSendContext(message) {
    const referencedDiscordMessageId = message.reference?.messageId;
    if (!referencedDiscordMessageId) {
      return {};
    }

    const lineOriginMapping = this.messageMappingManager.getLineOriginByDiscordMessageId(referencedDiscordMessageId);
    if (!lineOriginMapping) {
      logger.debug('No LINE origin mapping found for Discord reply target', {
        discordMessageId: referencedDiscordMessageId,
        currentDiscordMessageId: message.id
      });
      return {};
    }

    const context = {
      quotedLineMessageId: lineOriginMapping.lineMessageId
    };

    if (lineOriginMapping.quoteToken) {
      context.quoteToken = lineOriginMapping.quoteToken;
    }

    if (this.isReplyTokenUsable(lineOriginMapping)) {
      context.replyToken = lineOriginMapping.replyToken;
      context.replyTokenLineMessageId = lineOriginMapping.lineMessageId;
      context.replyTokenExpiry = lineOriginMapping.replyTokenExpiry;
    }

    if (!context.quoteToken && !context.replyToken) {
      logger.debug('No LINE reply or quote token found for Discord reply target', {
        discordMessageId: referencedDiscordMessageId,
        currentDiscordMessageId: message.id
      });
      return {};
    }

    return context;
  }

  isReplyTokenUsable(mapping) {
    if (!mapping?.replyToken || mapping.replyTokenUsedAt) {
      return false;
    }

    if (!mapping.replyTokenExpiry) {
      return true;
    }

    return new Date(mapping.replyTokenExpiry).getTime() > Date.now();
  }

  applyLineSendContext(messagePayload, context = {}) {
    if (!context.quoteToken || !messagePayload || typeof messagePayload !== 'object') {
      return messagePayload;
    }

    return {
      ...messagePayload,
      quoteToken: context.quoteToken
    };
  }
}

module.exports = ReplyBridgeFeature;
