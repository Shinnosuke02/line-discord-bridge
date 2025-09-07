/**
 * ログ設定
 * Winstonを使用した構造化ログ
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const config = require('../config');

// ログフォーマット
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// コンソールフォーマット
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// ログトランスポート
const transports = [];

// コンソール出力
transports.push(
  new winston.transports.Console({
    level: config.logging.level,
    format: consoleFormat
  })
);

// ファイル出力（本番環境）
if (config.app.environment === 'production') {
  // エラーログ
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: config.logging.datePattern,
      level: 'error',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  );

  // 全ログ
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: config.logging.datePattern,
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  );
}

// ロガーインスタンスを作成
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false
});

// 未処理の例外と拒否をキャッチ
logger.exceptions.handle(
  new winston.transports.Console({
    format: consoleFormat
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: consoleFormat
  })
);

module.exports = logger;
