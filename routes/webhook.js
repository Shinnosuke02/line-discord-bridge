/**
 * Webhookルート
 */
const express = require('express');
const { rawBodyParser, lineWebhookMiddleware, webhookErrorHandler } = require('../middleware/lineWebhook');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * LINE Webhookエンドポイント
 * @param {Object} messageBridge - メッセージブリッジインスタンス
 */
function createWebhookHandler(messageBridge) {
  return async (req, res) => {
    try {
      // イベントを順次処理
      for (const event of req.body.events || []) {
        await messageBridge.handleLineToDiscord(event);
      }
      
      res.status(200).send('OK');
      logger.debug('Webhook processed successfully', { 
        eventCount: req.body.events?.length || 0 
      });
    } catch (error) {
      logger.error('Webhook processing error', error);
      res.status(500).send('NG');
    }
  };
}

/**
 * Webhookルートを設定
 * @param {Object} messageBridge - メッセージブリッジインスタンス
 */
function setupWebhookRoutes(messageBridge) {
  router.post('/webhook',
    rawBodyParser,
    lineWebhookMiddleware,
    createWebhookHandler(messageBridge),
    webhookErrorHandler
  );

  logger.info('Webhook routes configured');
  return router;
}

module.exports = setupWebhookRoutes; 