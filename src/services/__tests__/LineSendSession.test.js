const LineSendSession = require('../LineSendSession');

describe('LineSendSession', () => {
  test('claimReplyToken returns a reply token only once', () => {
    const session = new LineSendSession({
      replyToken: 'reply-token-1',
      replyTokenLineMessageId: 'line-message-1',
      replyTokenExpiry: '2026-07-01T00:00:00.000Z',
      quoteToken: 'quote-token-1'
    });

    expect(session.claimReplyToken()).toEqual({
      replyToken: 'reply-token-1',
      replyTokenLineMessageId: 'line-message-1',
      replyTokenExpiry: '2026-07-01T00:00:00.000Z'
    });
    expect(session.claimReplyToken()).toBeNull();
  });

  test('getPushContext excludes reply token fields but preserves quote context', () => {
    const session = new LineSendSession({
      replyToken: 'reply-token-1',
      replyTokenLineMessageId: 'line-message-1',
      replyTokenExpiry: '2026-07-01T00:00:00.000Z',
      quoteToken: 'quote-token-1',
      quotedLineMessageId: 'line-message-1'
    });

    expect(session.getPushContext()).toEqual({
      quoteToken: 'quote-token-1',
      quotedLineMessageId: 'line-message-1'
    });
  });
});
