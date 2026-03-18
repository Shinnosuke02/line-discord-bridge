jest.mock('../../utils/logger');
jest.mock('../../config', () => ({
  webhook: {
    enabled: true
  }
}));
jest.mock('discord.js', () => ({
  MessagePayload: {
    create: jest.fn()
  },
  Routes: {
    webhook: jest.fn((id, token) => `/webhooks/${id}/${token}`)
  }
}));

const { MessagePayload, Routes } = require('discord.js');
const WebhookManager = require('../WebhookManager');

describe('WebhookManager reply payload', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sendMessage uses raw REST payload for webhook replies', async () => {
    const webhookSend = jest.fn().mockResolvedValue({ id: 'sent-1' });
    const restPost = jest.fn().mockResolvedValue({ id: 'sent-1' });
    const resolveFiles = jest.fn().mockResolvedValue({
      body: {
        content: 'reply body',
        username: 'LINE User',
        avatar_url: 'https://example.com/avatar.png'
      },
      files: []
    });
    MessagePayload.create.mockReturnValue({
      resolveBody: jest.fn().mockReturnValue({
        resolveFiles
      })
    });
    const manager = new WebhookManager({});
    manager.getOrCreateWebhook = jest.fn().mockResolvedValue({
      id: 'webhook-1',
      token: 'token-1',
      send: webhookSend,
      client: {
        rest: {
          post: restPost
        }
      }
    });

    await manager.sendMessage(
      'channel-1',
      { content: 'reply body' },
      'LINE User',
      'https://example.com/avatar.png',
      'discord-origin-1'
    );

    expect(webhookSend).not.toHaveBeenCalled();
    expect(MessagePayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'webhook-1',
        token: 'token-1'
      }),
      {
        content: 'reply body',
        username: 'LINE User',
        avatarURL: 'https://example.com/avatar.png',
        files: []
      }
    );
    expect(Routes.webhook).toHaveBeenCalledWith('webhook-1', 'token-1');
    expect(restPost).toHaveBeenCalledWith('/webhooks/webhook-1/token-1', {
      body: {
        content: 'reply body',
        username: 'LINE User',
        avatar_url: 'https://example.com/avatar.png',
        message_reference: {
          message_id: 'discord-origin-1',
          fail_if_not_exists: false
        }
      },
      files: [],
      query: {
        wait: true
      },
      auth: false
    });
  });
});
