const LineService = require('../LineService');

jest.mock('../../utils/logger');

describe('LineService send result normalization', () => {
  test('pushMessage exposes first sent message metadata', async () => {
    const client = {
      pushMessage: jest.fn().mockResolvedValue({
        sentMessages: [{
          id: 'line-message-1',
          quoteToken: 'quote-token-1'
        }]
      })
    };
    const lineService = new LineService({ client });
    lineService.checkRateLimit = jest.fn();

    const result = await lineService.pushMessage('user-1', {
      type: 'text',
      text: 'hello'
    });

    expect(result.messageId).toBe('line-message-1');
    expect(result.quoteToken).toBe('quote-token-1');
    expect(result.sentMessage).toEqual({
      id: 'line-message-1',
      quoteToken: 'quote-token-1'
    });
  });
});
