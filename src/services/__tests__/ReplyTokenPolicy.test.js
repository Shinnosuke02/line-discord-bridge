const ReplyTokenPolicy = require('../ReplyTokenPolicy');

describe('ReplyTokenPolicy', () => {
  test('createExpiry uses the configured ttl', () => {
    const policy = new ReplyTokenPolicy({
      now: () => new Date('2026-07-01T00:00:00.000Z').getTime(),
      replyTokenTtlMs: 60000
    });

    expect(policy.createExpiry()).toBe('2026-07-01T00:01:00.000Z');
  });

  test('isUsable rejects missing, used, and expired reply tokens', () => {
    const now = new Date('2026-07-01T00:00:00.000Z').getTime();
    const policy = new ReplyTokenPolicy({ now: () => now });

    expect(policy.isUsable(null)).toBe(false);
    expect(policy.isUsable({ replyToken: null })).toBe(false);
    expect(policy.isUsable({ replyToken: 'token', replyTokenUsedAt: '2026-07-01T00:00:00.000Z' })).toBe(false);
    expect(policy.isUsable({ replyToken: 'token', replyTokenExpiry: '2026-06-30T23:59:59.999Z' })).toBe(false);
  });

  test('isUsable accepts an unused token before expiry', () => {
    const now = new Date('2026-07-01T00:00:00.000Z').getTime();
    const policy = new ReplyTokenPolicy({ now: () => now });

    expect(policy.isUsable({
      replyToken: 'token',
      replyTokenExpiry: '2026-07-01T00:00:01.000Z'
    })).toBe(true);
  });
});
