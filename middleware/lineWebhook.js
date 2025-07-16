/**
 * LINE Webhookミドルウェア
 */
const getRawBody = require('raw-body');
const { middleware } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * 生のリクエストボディを解析するミドルウェア
 */
function rawBodyParser(req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: req.charset || 'utf-8',
  }, (err, string) => {
    if (err) {
      logger.error('Failed to parse raw body', err);
      return next(err);
    }
    
    req.rawBody = string;
    try {
      req.body = JSON.parse(string);
    } catch (parseError) {
      logger.error('Failed to parse JSON body', parseError);
      req.body = {};
    }
    next();
  });
}

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

module.exports = {
  rawBodyParser,
  lineWebhookMiddleware,
  webhookErrorHandler,
}; 