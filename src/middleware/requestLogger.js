/**
 * リクエストログミドルウェア
 */
const logger = require('../utils/logger');

/**
 * リクエストログを記録
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // レスポンス完了時のログ
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length')
    };

    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  next();
};

module.exports = {
  requestLogger
};
