/**
 * セキュリティミドルウェア
 * セキュリティ関連のHTTPヘッダーを設定
 */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * セキュリティヘッダーを設定
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });
}

/**
 * レート制限ミドルウェア
 */
function rateLimiter() {
  if (!config.security.rateLimit.enabled) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.maxRequests,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
      });
    }
  });
}

/**
 * CORS設定
 */
function corsConfig() {
  if (!config.security.cors.enabled) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const origin = req.headers.origin;
    
    if (config.security.cors.origins.includes('*') || 
        config.security.cors.origins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}

/**
 * リクエストサイズ制限
 */
function requestSizeLimit() {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSize = config.file.maxFileSize;
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: maxSize,
        receivedSize: contentLength
      });
    }
    
    next();
  };
}

/**
 * IPホワイトリスト
 */
function ipWhitelist(allowedIPs = []) {
  if (allowedIPs.length === 0) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP)) {
      next();
    } else {
      res.status(403).json({
        error: 'Access denied',
        ip: clientIP
      });
    }
  };
}

/**
 * ユーザーエージェントフィルタリング
 */
function userAgentFilter(blockedPatterns = []) {
  if (blockedPatterns.length === 0) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    
    const isBlocked = blockedPatterns.some(pattern => 
      userAgent.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (isBlocked) {
      res.status(403).json({
        error: 'Access denied',
        reason: 'Blocked user agent'
      });
    } else {
      next();
    }
  };
}

/**
 * セキュリティミドルウェアの統合
 */
function securityMiddleware() {
  return [
    securityHeaders(),
    rateLimiter(),
    corsConfig(),
    requestSizeLimit(),
    userAgentFilter(['bot', 'crawler', 'spider'])
  ];
}

module.exports = {
  securityHeaders,
  rateLimiter,
  corsConfig,
  requestSizeLimit,
  ipWhitelist,
  userAgentFilter,
  securityMiddleware
};