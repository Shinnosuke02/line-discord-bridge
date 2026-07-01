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
  getLineToDiscordMapping: jest.fn(),
  markReplyTokenUsed: jest.fn()
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
  initialize: jest.fn(),
  shouldLimitMessage: jest.fn(() => ({ allowed: true })),
  recordMessageSent: jest.fn(),
  getLimitStatus: jest.fn(() => ({}))
}));

jest.mock('../../utils/logger');

const MessageBridge = require('../MessageBridge');
const lineLimitHandler = require('../../middleware/lineLimitHandler');

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

  test('sendTrackedLineMessageは有効なreplyTokenを優先してreplyMessageで送信する', async () => {
    messageBridge.messageMappingManager.markReplyTokenUsed.mockResolvedValue(true);
    messageBridge.lineService.replyMessage.mockResolvedValue({
      messageId: 'line-reply-1'
    });

    const result = await messageBridge.sendTrackedLineMessage(
      'line-user-1',
      { type: 'text', text: 'quick reply' },
      {
        replyToken: 'reply-token-1',
        replyTokenLineMessageId: 'line-original-1',
        quoteToken: 'quote-token-1'
      }
    );

    expect(messageBridge.messageMappingManager.markReplyTokenUsed).toHaveBeenCalledWith('line-original-1');
    expect(messageBridge.lineService.replyMessage).toHaveBeenCalledWith(
      'reply-token-1',
      { type: 'text', text: 'quick reply' }
    );
    expect(messageBridge.lineService.pushMessage).not.toHaveBeenCalled();
    expect(lineLimitHandler.recordMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ messageId: 'line-reply-1' });
  });

  test('sendTrackedLineMessageはreplyTokenが使えない場合quoteToken付きpushMessageへフォールバックする', async () => {
    messageBridge.messageMappingManager.markReplyTokenUsed.mockResolvedValue(false);
    messageBridge.lineService.pushMessage.mockResolvedValue({
      messageId: 'line-push-1'
    });

    const result = await messageBridge.sendTrackedLineMessage(
      'line-user-1',
      { type: 'text', text: 'late reply' },
      {
        replyToken: 'reply-token-1',
        replyTokenLineMessageId: 'line-original-1',
        quoteToken: 'quote-token-1'
      }
    );

    expect(messageBridge.lineService.replyMessage).not.toHaveBeenCalled();
    expect(messageBridge.lineService.pushMessage).toHaveBeenCalledWith(
      'line-user-1',
      { type: 'text', text: 'late reply', quoteToken: 'quote-token-1' }
    );
    expect(lineLimitHandler.recordMessageSent).toHaveBeenCalled();
    expect(result).toEqual({ messageId: 'line-push-1' });
  });

  test('processDiscordToLineの位置情報送信はPush通数を二重記録しない', async () => {
    messageBridge.featureManager.resolveLineSendContext = jest.fn().mockResolvedValue({});
    messageBridge.lineService.pushMessage.mockResolvedValue({
      messageId: 'line-location-1'
    });

    await messageBridge.processDiscordToLine(
      {
        id: 'discord-location-1',
        channelId: 'channel-1',
        content: '35.6895, 139.6917',
        attachments: { size: 0 },
        stickers: { size: 0 }
      },
      'line-user-1'
    );

    expect(messageBridge.lineService.pushMessage).toHaveBeenCalledWith(
      'line-user-1',
      {
        type: 'location',
        title: '位置情報',
        address: null,
        latitude: 35.6895,
        longitude: 139.6917
      }
    );
    expect(lineLimitHandler.recordMessageSent).toHaveBeenCalledTimes(1);
    expect(messageBridge.messageMappingManager.mapDiscordToLine).toHaveBeenCalledWith(
      'discord-location-1',
      'line-location-1',
      'line-user-1',
      'channel-1'
    );
  });

  test('getMetricsが正しい値を返す', () => {
    const metrics = messageBridge.getMetrics();
    
    expect(metrics).toBeDefined();
    expect(metrics.messagesProcessed).toBe(0);
    expect(metrics.errors).toBe(0);
    expect(metrics.uptime).toBeDefined();
  });
});
