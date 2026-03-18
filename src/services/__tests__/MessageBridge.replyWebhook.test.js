jest.mock('discord.js', () => {
  const mockClientInstance = {
    channels: {
      fetch: jest.fn()
    },
    guilds: {
      cache: {
        size: 0
      }
    },
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
      GuildMessageReactions: 3,
      DirectMessageReactions: 4,
      MessageContent: 5
    }
  };
});

jest.mock('../LineService', () => jest.fn(() => ({
  pushMessage: jest.fn(),
  getDisplayName: jest.fn(),
  getUserProfile: jest.fn(),
  getGroupMemberProfile: jest.fn(),
  getGroupSummary: jest.fn()
})));

jest.mock('../DiscordService', () => jest.fn(() => ({
  setClient: jest.fn()
})));

jest.mock('../MediaService', () => jest.fn(() => ({
  shutdown: jest.fn()
})));

jest.mock('../MessageMappingManager', () => jest.fn(() => ({
  initialize: jest.fn()
})));

jest.mock('../ChannelManager', () => jest.fn(() => ({
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
  getMonitoringStatus: jest.fn(() => ({}))
})));

jest.mock('../../utils/messageBatcher', () => jest.fn(() => ({
  getBatchStatus: jest.fn(() => ({})),
  flushAllBatches: jest.fn()
})));

jest.mock('../../middleware/lineLimitHandler', () => ({
  shouldLimitMessage: jest.fn(() => ({ allowed: true })),
  recordMessageSent: jest.fn(),
  getLimitStatus: jest.fn(() => ({}))
}));

jest.mock('../../utils/logger');

const MessageBridge = require('../MessageBridge');

describe('MessageBridge webhook reply routing', () => {
  let messageBridge;

  beforeEach(() => {
    messageBridge = new MessageBridge();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sendToDiscord keeps webhook identity for reply messages', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ id: 'discord-reply-1' });
    messageBridge.webhookManager = {
      sendMessage
    };

    const result = await messageBridge.sendToDiscord(
      'channel-1',
      { content: 'reply body' },
      {
        useWebhook: true,
        username: 'LINE User',
        avatarUrl: 'https://example.com/avatar.png',
        replyToMessageId: 'discord-origin-1'
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      'channel-1',
      { content: 'reply body' },
      'LINE User',
      'https://example.com/avatar.png',
      'discord-origin-1'
    );
    expect(result).toEqual({ id: 'discord-reply-1' });
  });
});
