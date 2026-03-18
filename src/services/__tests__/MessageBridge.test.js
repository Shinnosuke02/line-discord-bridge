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
  replyMessage: jest.fn(),
  getDisplayName: jest.fn(),
  getUserProfile: jest.fn(),
  getGroupMemberProfile: jest.fn(),
  getGroupSummary: jest.fn()
})));

jest.mock('../DiscordService', () => jest.fn(() => ({
  sendMessage: jest.fn(),
  setClient: jest.fn()
})));

jest.mock('../MediaService', () => jest.fn(() => ({
  shutdown: jest.fn()
})));

jest.mock('../MessageMappingManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  mapLineToDiscord: jest.fn(),
  mapDiscordToLine: jest.fn(),
  getLineToDiscordMapping: jest.fn()
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
  updateConfig: jest.fn(),
  addToBatch: jest.fn(),
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

describe('MessageBridge', () => {
  let messageBridge;

  beforeEach(() => {
    messageBridge = new MessageBridge();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('MessageBridgeが正常に初期化される', () => {
    expect(messageBridge).toBeDefined();
    expect(messageBridge.isInitialized).toBe(false);
  });

  test('メトリクスが初期化される', () => {
    expect(messageBridge.metrics).toBeDefined();
    expect(messageBridge.metrics.messagesProcessed).toBe(0);
    expect(messageBridge.metrics.errors).toBe(0);
    expect(messageBridge.metrics.startTime).toBeDefined();
  });

  test('sendToDiscordはreply指定なしで通常送信する', async () => {
    const mockChannel = {
      send: jest.fn().mockResolvedValue({ id: 'message-1' })
    };
    messageBridge.discord.channels.fetch.mockResolvedValue(mockChannel);

    const result = await messageBridge.sendToDiscord('channel-1', {
      content: 'hello'
    });

    expect(mockChannel.send).toHaveBeenCalledWith({
      content: 'hello'
    });
    expect(result).toEqual({ id: 'message-1' });
  });

  test('getMetricsが正しい値を返す', () => {
    const metrics = messageBridge.getMetrics();
    
    expect(metrics).toBeDefined();
    expect(metrics.messagesProcessed).toBe(0);
    expect(metrics.errors).toBe(0);
    expect(metrics.uptime).toBeDefined();
  });
});
