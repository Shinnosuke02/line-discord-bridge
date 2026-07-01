const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'accessToken',
  'authorization',
  'body',
  'channelAccessToken',
  'channelSecret',
  'lineChannelAccessToken',
  'lineChannelSecret',
  'password',
  'quoteToken',
  'rawBody',
  'replyToken',
  'requestBody',
  'secret',
  'signature',
  'token',
  'webhookToken',
  'webhookUrl',
  'x-line-signature'
]);

function isSensitiveKey(key) {
  if (!key) {
    return false;
  }

  if (SENSITIVE_KEYS.has(key)) {
    return true;
  }

  const normalized = key.toLowerCase();

  return (
    normalized.includes('replytoken') ||
    normalized.includes('quotetoken') ||
    normalized.includes('accesstoken') ||
    normalized.includes('webhooktoken') ||
    normalized.includes('webhookurl') ||
    normalized.includes('channelsecret') ||
    normalized === 'x_line_signature'
  );
}

function redactString(value) {
  return value
    .replace(/(https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/)[^\s"'<>\\]+/gi, `$1${REDACTED}`)
    .replace(/(\/webhooks\/\d+\/)[^\s"'<>\\]+/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/(["']?(?:replyToken|quoteToken|accessToken|channelAccessToken|webhookToken)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, `$1${REDACTED}`)
    .replace(/\b((?:access_token|token|signature)=)[^&\s]+/gi, `$1${REDACTED}`);
}

function redactLogData(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (value instanceof Error) {
    const redactedError = {};

    Object.getOwnPropertyNames(value).forEach((key) => {
      redactedError[key] = isSensitiveKey(key)
        ? REDACTED
        : redactLogData(value[key], seen);
    });

    return redactedError;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogData(item, seen));
  }

  return Object.entries(value).reduce((redacted, [key, nestedValue]) => {
    redacted[key] = isSensitiveKey(key)
      ? REDACTED
      : redactLogData(nestedValue, seen);

    return redacted;
  }, {});
}

module.exports = {
  REDACTED,
  redactLogData,
  redactString
};
