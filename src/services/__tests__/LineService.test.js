const LineService = require('../LineService');

jest.mock('../../utils/logger');

describe('LineService', () => {
  let client;
  let lineService;

  beforeEach(() => {
    client = {
      pushMessage: jest.fn(),
      replyMessage: jest.fn(),
      getProfile: jest.fn(),
      getGroupSummary: jest.fn(),
      getGroupMemberProfile: jest.fn(),
      getRoomMemberProfile: jest.fn(),
      getMessageContent: jest.fn(),
      linkRichMenuIdToUser: jest.fn(),
      unlinkRichMenuIdFromUser: jest.fn(),
      markMessagesAsReadByToken: jest.fn()
    };
    lineService = new LineService({ client });
    lineService.checkRateLimit = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initializes with an injected modern LINE client', () => {
    expect(lineService.client).toBe(client);
  });

  test('pushMessage uses the v11 request body and a retry key', async () => {
    client.pushMessage.mockResolvedValue({
      sentMessages: [{ id: 'line-1', quoteToken: 'quote-1' }]
    });

    const message = { type: 'text', text: 'hello' };
    const result = await lineService.pushMessage('U1', message);

    expect(client.pushMessage).toHaveBeenCalledTimes(1);
    expect(client.pushMessage.mock.calls[0][0]).toEqual({
      to: 'U1',
      messages: [message]
    });
    expect(client.pushMessage.mock.calls[0][1]).toEqual(expect.any(String));
    expect(result.messageId).toBe('line-1');
    expect(result.quoteToken).toBe('quote-1');
  });

  test('replyMessage uses the v11 request body', async () => {
    client.replyMessage.mockResolvedValue({ sentMessages: [{ id: 'line-reply-1' }] });
    const message = { type: 'text', text: 'reply' };

    const result = await lineService.replyMessage('reply-token', message);

    expect(client.replyMessage).toHaveBeenCalledWith({
      replyToken: 'reply-token',
      messages: [message]
    });
    expect(result.messageId).toBe('line-reply-1');
  });

  test('gets user and room profiles through the modern client', async () => {
    client.getProfile.mockResolvedValue({ displayName: 'Alice' });
    client.getRoomMemberProfile.mockResolvedValue({ displayName: 'Bob' });

    await expect(lineService.getUserProfile('U1')).resolves.toEqual({ displayName: 'Alice' });
    await expect(lineService.getRoomMemberProfile('R1', 'U2')).resolves.toEqual({ displayName: 'Bob' });
  });

  test('markMessagesAsRead is optional and uses the token request shape', async () => {
    await expect(lineService.markMessagesAsRead(null)).resolves.toBe(false);
    client.markMessagesAsReadByToken.mockResolvedValue({});

    await expect(lineService.markMessagesAsRead('read-token')).resolves.toBe(true);
    expect(client.markMessagesAsReadByToken).toHaveBeenCalledWith({
      markAsReadToken: 'read-token'
    });
  });

  test('propagates non-retryable API errors', async () => {
    const error = new Error('API Error');
    error.status = 400;
    client.pushMessage.mockRejectedValue(error);

    await expect(lineService.pushMessage('U1', { type: 'text', text: 'x' }))
      .rejects.toThrow('API Error');
  });
});
