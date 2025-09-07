/**
 * エラーハンドリングミドルウェア
 */
const logger = require('../utils/logger');

/**
 * 404エラーハンドラー
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString()
  });
};

/**
 * グローバルエラーハンドラー
 */
const errorHandler = (error, req, res, next) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // 本番環境では詳細なエラー情報を隠す
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: error.stack })
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
