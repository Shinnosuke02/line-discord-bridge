/**
 * ログユーティリティ
 * Winstonを使用した構造化ログ
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// ログディレクトリの作成
const logDir = path.join(process.cwd(), 'logs');

// カスタムフォーマット
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

// ログレベル設定
const logLevel = process.env.LOG_LEVEL || 'info';

// トランスポート設定
const transports = [
  // コンソール出力
  new winston.transports.Console({
    level: logLevel,
    format: consoleFormat
  }),

  // 全ログファイル
  new DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level: logLevel,
    format: logFormat
  }),

  // エラーログファイル
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: logFormat
  }),

  // 警告ログファイル
  new DailyRotateFile({
    filename: path.join(logDir, 'warn-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'warn',
    format: logFormat
  })
];

// 本番環境ではコンソール出力を無効化
if (process.env.NODE_ENV === 'production') {
  transports[0].silent = true;
}

// ロガー作成
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'line-discord-bridge',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports,
  exitOnError: false
});

// 未処理の例外とリジェクトをキャッチ
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logDir, 'exceptions.log'),
    format: logFormat
  })
);

logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logDir, 'rejections.log'),
    format: logFormat
  })
);

// ログレベルの確認
logger.info('Logger initialized', {
  level: logLevel,
  environment: process.env.NODE_ENV || 'development',
  logDir
});

module.exports = logger;