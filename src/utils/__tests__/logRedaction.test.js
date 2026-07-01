const { REDACTED, redactLogData, redactString } = require('../logRedaction');

describe('logRedaction', () => {
  it('redacts sensitive token fields recursively', () => {
    const redacted = redactLogData({
      replyToken: 'reply-secret',
      nested: {
        quoteToken: 'quote-secret',
        channelAccessToken: 'channel-secret',
        safe: 'visible'
      },
      items: [
        {
          webhookToken: 'webhook-secret'
        }
      ]
    });

    expect(redacted).toEqual({
      replyToken: REDACTED,
      nested: {
        quoteToken: REDACTED,
        channelAccessToken: REDACTED,
        safe: 'visible'
      },
      items: [
        {
          webhookToken: REDACTED
        }
      ]
    });
  });

  it('redacts raw request body style fields', () => {
    const redacted = redactLogData({
      method: 'POST',
      body: {
        events: [
          {
            replyToken: 'reply-secret',
            message: {
              text: 'hello'
            }
          }
        ]
      },
      rawBody: '{"replyToken":"reply-secret"}'
    });

    expect(redacted).toEqual({
      method: 'POST',
      body: REDACTED,
      rawBody: REDACTED
    });
  });

  it('redacts token-like content inside strings', () => {
    const input = [
      'Authorization: Bearer line-access-token',
      'replyToken=reply-secret',
      'quoteToken: quote-secret',
      'https://discord.com/api/webhooks/1234567890/webhook-secret',
      '/webhooks/1234567890/webhook-secret'
    ].join('\n');

    const redacted = redactString(input);

    expect(redacted).toContain(`Bearer ${REDACTED}`);
    expect(redacted).toContain(`replyToken=${REDACTED}`);
    expect(redacted).toContain(`quoteToken: ${REDACTED}`);
    expect(redacted).toContain(`/webhooks/1234567890/${REDACTED}`);
    expect(redacted).not.toContain('line-access-token');
    expect(redacted).not.toContain('reply-secret');
    expect(redacted).not.toContain('quote-secret');
    expect(redacted).not.toContain('webhook-secret');
  });

  it('preserves Error details while redacting sensitive fields', () => {
    const error = new Error('request failed with replyToken=reply-secret');
    error.replyToken = 'reply-secret';
    error.statusCode = 400;

    const redacted = redactLogData({ error });

    expect(redacted.error.message).toBe(`request failed with replyToken=${REDACTED}`);
    expect(redacted.error.replyToken).toBe(REDACTED);
    expect(redacted.error.statusCode).toBe(400);
    expect(redacted.error.stack).toContain('request failed');
    expect(redacted.error.stack).not.toContain('reply-secret');
  });

  it('handles circular references without throwing', () => {
    const value = { safe: true };
    value.self = value;

    expect(redactLogData(value)).toEqual({
      safe: true,
      self: '[Circular]'
    });
  });
});
