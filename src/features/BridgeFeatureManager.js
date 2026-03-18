const config = require('../config');
const logger = require('../utils/logger');
const ReplyBridgeFeature = require('./ReplyBridgeFeature');
const ReactionBridgeFeature = require('./ReactionBridgeFeature');

class BridgeFeatureManager {
  constructor({ messageMappingManager } = {}) {
    this.messageMappingManager = messageMappingManager;
    this.replyFeature = config.features.replyBridgeEnabled
      ? new ReplyBridgeFeature({ messageMappingManager })
      : null;
    this.reactionFeature = new ReactionBridgeFeature();
  }

  async initialize() {
    logger.info('Bridge features initialized', {
      replyBridgeEnabled: !!this.replyFeature,
      reactionBridgeEnabled: config.features.reactionBridgeEnabled && this.reactionFeature.isSupported()
    });

    if (config.features.reactionBridgeEnabled && !this.reactionFeature.isSupported()) {
      this.reactionFeature.logUnsupported();
    }
  }

  requiresDirectLineTracking() {
    return !!this.replyFeature?.requiresDirectLineTracking();
  }

  async resolveDiscordSendOptions(event) {
    if (!this.replyFeature) {
      return {};
    }

    return this.replyFeature.resolveDiscordSendOptions(event);
  }

  async resolveLineSendContext(message) {
    if (!this.replyFeature) {
      return {};
    }

    return this.replyFeature.resolveLineSendContext(message);
  }

  applyLineSendContext(messagePayload, context = {}) {
    if (!this.replyFeature) {
      return messagePayload;
    }

    return this.replyFeature.applyLineSendContext(messagePayload, context);
  }
}

module.exports = BridgeFeatureManager;
