const logger = require('../utils/logger');

class ReactionBridgeFeature {
  getName() {
    return 'reaction-bridge';
  }

  isSupported() {
    return false;
  }

  getCapabilityReport() {
    return {
      supported: false,
      reason: 'LINE Messaging API に相互リアクション送受信の公開 API が見当たらないため無効化'
    };
  }

  logUnsupported() {
    logger.info('Reaction bridge feature is disabled', this.getCapabilityReport());
  }
}

module.exports = ReactionBridgeFeature;
