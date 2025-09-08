/**
 * Webhookルート
 */
const express = require('express');
const { lineWebhookMiddleware, webhookErrorHandler, webhookLogMiddleware } = require('../middleware/lineWebhook');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * LINE Webhookエンドポイント
 * @param {Object} messageBridge - メッセージブリッジインスタンス
 */
function createWebhookHandler(messageBridge) {
  return async (req, res) => {
    try {
      // リクエストボディの検証
      if (!req.body || !req.body.events) {
        logger.warn('Invalid webhook request body', { body: req.body });
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // イベントを順次処理
      const events = req.body.events || [];
      logger.info('Processing webhook events', { eventCount: events.length });

      for (const event of events) {
        try {
          await messageBridge.handleLineToDiscord(event);
        } catch (eventError) {
          logger.error('Failed to process individual event', { 
            event, 
            error: eventError.message 
          });
          // 個別イベントのエラーは記録するが、全体の処理は継続
        }
      }
      
      res.status(200).send('OK');
      logger.debug('Webhook processed successfully', { eventCount: events.length });
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
    webhookLogMiddleware,
    lineWebhookMiddleware,
    createWebhookHandler(messageBridge),
    webhookErrorHandler
  );

  logger.info('Webhook routes configured');
  return router;
}

module.exports = setupWebhookRoutes; 