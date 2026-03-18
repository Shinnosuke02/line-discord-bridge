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
    if (!lineOriginMapping?.quoteToken) {
      logger.debug('No LINE quote token found for Discord reply target', {
        discordMessageId: referencedDiscordMessageId,
        currentDiscordMessageId: message.id
      });
      return {};
    }

    return {
      quoteToken: lineOriginMapping.quoteToken,
      quotedLineMessageId: lineOriginMapping.lineMessageId
    };
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
