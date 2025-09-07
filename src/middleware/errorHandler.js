/**
 * エラーハンドリングミドルウェア
 * アプリケーション全体のエラーを統一的に処理
 */
const logger = require('../utils/logger');

/**
 * エラーハンドリングミドルウェア
 * @param {Error} err - エラーオブジェクト
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function errorHandler(err, req, res, next) {
  // エラーログの記録
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // エラーレスポンスの送信
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  // 本番環境では詳細なエラー情報を隠す
  const response = {
    error: true,
    message: message,
    timestamp: new Date().toISOString(),
    path: req.path
  };

  // 開発環境ではスタックトレースを含める
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = err;
  }

  res.status(statusCode).json(response);
}

/**
 * 404エラーハンドラー
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function notFoundHandler(req, res, next) {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

/**
 * 非同期エラーハンドラー
 * @param {Function} fn - 非同期関数
 * @returns {Function} ラップされた関数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * カスタムエラークラス
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * バリデーションエラーハンドラー
 * @param {Error} err - バリデーションエラー
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function validationErrorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    const error = new AppError(`Validation Error: ${errors.join(', ')}`, 400);
    return next(error);
  }
  next(err);
}

/**
 * キャストエラーハンドラー
 * @param {Error} err - キャストエラー
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function castErrorHandler(err, req, res, next) {
  if (err.name === 'CastError') {
    const error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
    return next(error);
  }
  next(err);
}

/**
 * 重複キーエラーハンドラー
 * @param {Error} err - 重複キーエラー
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function duplicateKeyErrorHandler(err, req, res, next) {
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const error = new AppError(`Duplicate field value: ${field} = ${value}`, 400);
    return next(error);
  }
  next(err);
}

/**
 * JWTエラーハンドラー
 * @param {Error} err - JWTエラー
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function jwtErrorHandler(err, req, res, next) {
  if (err.name === 'JsonWebTokenError') {
    const error = new AppError('Invalid token', 401);
    return next(error);
  }
  if (err.name === 'TokenExpiredError') {
    const error = new AppError('Token expired', 401);
    return next(error);
  }
  next(err);
}

/**
 * レート制限エラーハンドラー
 * @param {Error} err - レート制限エラー
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function rateLimitErrorHandler(err, req, res, next) {
  if (err.statusCode === 429) {
    const error = new AppError('Too many requests, please try again later', 429);
    return next(error);
  }
  next(err);
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  validationErrorHandler,
  castErrorHandler,
  duplicateKeyErrorHandler,
  jwtErrorHandler,
  rateLimitErrorHandler
};