/**
 * セキュリティミドルウェア
 */

/**
 * セキュリティヘッダーを設定
 */
const securityHeaders = (req, res, next) => {
  // XSS保護
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // HSTS（HTTPS環境でのみ）
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

module.exports = {
  securityHeaders
};
