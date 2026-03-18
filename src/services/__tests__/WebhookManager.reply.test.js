jest.mock('../../utils/logger');
jest.mock('../../config', () => ({
  webhook: {
    enabled: true
  }
}));

const WebhookManager = require('../WebhookManager');

describe('WebhookManager reply payload', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sendMessage passes messageReference as message id string', async () => {
    const webhookSend = jest.fn().mockResolvedValue({ id: 'sent-1' });
    const manager = new WebhookManager({});
    manager.getOrCreateWebhook = jest.fn().mockResolvedValue({
      id: 'webhook-1',
      send: webhookSend
    });

    await manager.sendMessage(
      'channel-1',
      { content: 'reply body' },
      'LINE User',
      'https://example.com/avatar.png',
      'discord-origin-1'
    );

    expect(webhookSend).toHaveBeenCalledWith({
      content: 'reply body',
      username: 'LINE User',
      avatarURL: 'https://example.com/avatar.png',
      files: [],
      messageReference: 'discord-origin-1'
    });
  });
});
