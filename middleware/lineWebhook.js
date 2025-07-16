/**
 * LINE Webhookミドルウェア
 */
const { middleware } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * LINE Webhook検証ミドルウェア
 */
const lineWebhookMiddleware = middleware(config.line);

/**
 * Webhookエラーハンドリングミドルウェア
 */
function webhookErrorHandler(err, req, res, next) {
  logger.error('Webhook middleware error', err);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Webhookリクエストログミドルウェア
 */
function webhookLogMiddleware(req, res, next) {
  logger.debug('Webhook request received', {
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'x-line-signature': req.headers['x-line-signature'] ? 'present' : 'missing',
    },
  });
  next();
}

module.exports = {
  lineWebhookMiddleware,
  webhookErrorHandler,
  webhookLogMiddleware,
}; 