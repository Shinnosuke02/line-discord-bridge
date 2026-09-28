jest.mock('discord.js', () => {
  const mockClientInstance = {
    channels: { fetch: jest.fn() },
    guilds: { cache: { size: 0 } },
    once: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
    login: jest.fn()
  };
  return {
    Client: jest.fn(() => mockClientInstance),
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 3
    },
    Events: { ClientReady: 'clientReady' }
  };
});

jest.mock('../LineService', () => jest.fn(() => ({
  pushMessage: jest.fn(),
  replyMessage: jest.fn(),
  getDisplayName: jest.fn()
})));
jest.mock('../DiscordService', () => jest.fn(() => ({ setClient: jest.fn() })));
jest.mock('../MediaService', () => jest.fn(() => ({ shutdown: jest.fn() })));
jest.mock('../MessageMappingManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  getStats: jest.fn(() => ({}))
})));
jest.mock('../PersistentChannelManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  stop: jest.fn()
})));
jest.mock('../WebhookManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  stop: jest.fn(),
  sendMessage: jest.fn()
})));
jest.mock('../LineUsageMonitor', () => jest.fn(() => ({
  startMonitoring: jest.fn(),
  stopMonitoring: jest.fn(),
  getMonitoringStatus: jest.fn(() => ({}))
})));
jest.mock('../../middleware/lineLimitHandler', () => ({
  initialize: jest.fn(),
  shouldLimitMessage: jest.fn(() => ({ allowed: true })),
  recordMessageSent: jest.fn(),
  getLimitStatus: jest.fn(() => ({}))
}));
jest.mock('../../utils/logger');

const config = require('../../config');
const MessageBridge = require('../MessageBridge');

describe('MessageBridge webhook reply routing', () => {
  let bridge;
  let originalReplyMode;

  beforeEach(() => {
    originalReplyMode = config.features.lineToDiscordReplyMode;
    config.features.lineToDiscordReplyMode = 'webhook';
    bridge = new MessageBridge();
  });

  afterEach(() => {
    config.features.lineToDiscordReplyMode = originalReplyMode;
    jest.clearAllMocks();
  });

  test('keeps webhook identity for reply messages', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ id: 'discord-reply-1' });
    bridge.webhookManager = { sendMessage };

    const result = await bridge.sendToDiscord(
      'C1',
      { content: 'reply body' },
      {
        useWebhook: true,
        username: 'LINE User',
        avatarUrl: 'https://example.com/avatar.png',
        replyToMessageId: 'origin-1'
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      'C1',
      { content: 'reply body' },
      'LINE User',
      'https://example.com/avatar.png',
      'origin-1'
    );
    expect(result.id).toBe('discord-reply-1');
  });

  test('bot-reply mode preserves reply reference and suppresses mentions', async () => {
    config.features.lineToDiscordReplyMode = 'bot-reply';
    const original = {
      content: 'original',
      member: { displayName: 'Original User' },
      author: {
        username: 'Original User',
        displayAvatarURL: jest.fn(() => 'https://example.com/original.png')
      }
    };
    const channel = {
      messages: { fetch: jest.fn().mockResolvedValue(original) },
      send: jest.fn().mockResolvedValue({ id: 'bot-reply-1' })
    };
    bridge.discord.channels.fetch.mockResolvedValue(channel);

    await bridge.sendToDiscord(
      'C1',
      { content: 'reply body' },
      {
        useWebhook: true,
        username: 'LINE User',
        avatarUrl: 'https://example.com/avatar.png',
        replyToMessageId: 'origin-1'
      }
    );

    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      allowedMentions: { parse: [] },
      reply: {
        messageReference: 'origin-1',
        failIfNotExists: false
      }
    }));
  });
});
