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

const config = require('../../config');
const MessageBridge = require('../MessageBridge');

describe('MessageBridge webhook reply routing', () => {
  let messageBridge;
  let originalReplyMode;

  beforeEach(() => {
    originalReplyMode = config.features.lineToDiscordReplyMode;
    config.features.lineToDiscordReplyMode = 'webhook';
    messageBridge = new MessageBridge();
  });

  afterEach(() => {
    config.features.lineToDiscordReplyMode = originalReplyMode;
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

  test('sendToDiscord can switch LINE replies to bot-reply mode', async () => {
    config.features.lineToDiscordReplyMode = 'bot-reply';
    const replyPayloads = [];
    const mockOriginalMessage = {
      content: 'original line content',
      member: {
        displayName: 'Original User'
      },
      author: {
        username: 'Original User',
        displayAvatarURL: jest.fn(() => 'https://example.com/original.png')
      }
    };
    const mockChannel = {
      messages: {
        fetch: jest.fn().mockResolvedValue(mockOriginalMessage)
      },
      send: jest.fn().mockImplementation(async (payload) => {
        replyPayloads.push(payload);
        return { id: 'discord-bot-reply-1' };
      })
    };
    messageBridge.discord.channels.fetch.mockResolvedValue(mockChannel);

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

    expect(mockChannel.messages.fetch).toHaveBeenCalledWith('discord-origin-1');
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'reply body',
        reply: {
          messageReference: 'discord-origin-1',
          failIfNotExists: false
        },
        embeds: [
          expect.objectContaining({
            author: {
              name: 'LINE User',
              icon_url: 'https://example.com/avatar.png'
            },
            description: 'Reply to Original User\noriginal line content'
          })
        ]
      })
    );
    expect(result).toEqual({ id: 'discord-bot-reply-1' });
    expect(replyPayloads).toHaveLength(1);
  });
});
