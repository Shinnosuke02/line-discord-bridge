/**
 * LINE Webhook signature verification.
 */
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

function isLineWebhookPath(req) {
  return req.path === config.line.webhookPath || req.originalUrl?.split('?')[0] === config.line.webhookPath;
}

function captureRawBody(req, res, buffer) {
  if (isLineWebhookPath(req)) {
    req.rawBody = Buffer.from(buffer);
  }
}

function createLineSignature(rawBody, channelSecret) {
  return crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');
}

function isValidLineSignature(rawBody, signature, channelSecret) {
  if (!rawBody || !signature || !channelSecret) {
    return false;
  }

  const expected = createLineSignature(rawBody, channelSecret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function lineSignatureMiddleware(req, res, next) {
  if (!config.security.lineSignatureValidationEnabled) {
    return next();
  }

  const signature = req.get('x-line-signature');
  if (!isValidLineSignature(req.rawBody, signature, config.line.channelSecret)) {
    logger.warn('Invalid LINE webhook signature', {
      hasSignature: !!signature,
      hasRawBody: !!req.rawBody
    });
    return res.status(401).json({ error: 'Invalid LINE signature' });
  }

  return next();
}

module.exports = {
  captureRawBody,
  createLineSignature,
  isValidLineSignature,
  lineSignatureMiddleware
};
