const LineService = require('../LineService');

jest.mock('@line/bot-sdk', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pushMessage: jest.fn(),
    replyMessage: jest.fn()
  }))
}));

jest.mock('../../utils/logger');

describe('LineService send result normalization', () => {
  let lineService;

  beforeEach(() => {
    lineService = new LineService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('pushMessage exposes first sent message metadata', async () => {
    lineService.client.pushMessage.mockResolvedValue({
      sentMessages: [
        {
          id: 'line-message-1',
          quoteToken: 'quote-token-1'
        }
      ]
    });

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
