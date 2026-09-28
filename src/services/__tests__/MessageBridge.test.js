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
    Events: {
      ClientReady: 'clientReady'
    }
  };
});

jest.mock('../LineService', () => jest.fn(() => ({
  pushMessage: jest.fn(),
  replyMessage: jest.fn(),
  getDisplayName: jest.fn(),
  getUserProfile: jest.fn(),
  getGroupMemberProfile: jest.fn(),
  getGroupSummary: jest.fn(),
  formatMessage: jest.fn((event) => event.message?.text || ''),
  markMessagesAsRead: jest.fn()
})));

jest.mock('../DiscordService', () => jest.fn(() => ({
  sendMessage: jest.fn(),
  setClient: jest.fn()
})));

jest.mock('../MediaService', () => jest.fn(() => ({
  shutdown: jest.fn(),
  processDiscordAttachments: jest.fn(),
  processDiscordStickers: jest.fn()
})));

jest.mock('../MessageMappingManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  stop: jest.fn(),
  mapLineToDiscord: jest.fn(),
  mapDiscordToLine: jest.fn(),
  mapDiscordToLines: jest.fn(),
  getLineToDiscordMapping: jest.fn(),
  getLineOriginByDiscordMessageId: jest.fn(),
  markReplyTokenUsed: jest.fn(),
  removeMapping: jest.fn(),
  getStats: jest.fn(() => ({}))
})));

jest.mock('../PersistentChannelManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  stop: jest.fn(),
  getLineUserId: jest.fn(),
  getChannelMapping: jest.fn()
})));

jest.mock('../WebhookManager', () => jest.fn(() => ({
  initialize: jest.fn(),
  stop: jest.fn(),
  sendMessage: jest.fn(),
  editMessage: jest.fn(),
  deleteMessage: jest.fn()
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

const MessageBridge = require('../MessageBridge');
const lineLimitHandler = require('../../middleware/lineLimitHandler');

describe('MessageBridge Phase 2', () => {
  let bridge;

  beforeEach(() => {
    bridge = new MessageBridge();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('registers the modern Discord clientReady event', () => {
    expect(bridge.discord.once).toHaveBeenCalledWith('clientReady', expect.any(Function));
  });

  test('sendToDiscord suppresses Discord mentions for bot delivery', async () => {
    const channel = {
      send: jest.fn().mockResolvedValue({ id: 'd1' })
    };
    bridge.discord.channels.fetch.mockResolvedValue(channel);

    await bridge.sendToDiscord('C1', { content: '@everyone hello' });

    expect(channel.send).toHaveBeenCalledWith({
      content: '@everyone hello',
      allowedMentions: { parse: [] }
    });
  });

  test('replyToken is used before push and recorded in the session', async () => {
    bridge.messageMappingManager.markReplyTokenUsed.mockResolvedValue(true);
    bridge.lineService.replyMessage.mockResolvedValue({
      messageId: 'line-reply-1',
      quoteToken: 'quote-reply-1'
    });

    const result = await bridge.sendTrackedLineMessage(
      'U1',
      { type: 'text', text: 'reply' },
      {
        replyToken: 'reply-token',
        replyTokenLineMessageId: 'line-origin',
        quoteToken: 'quote-origin'
      }
    );

    expect(bridge.lineService.replyMessage).toHaveBeenCalledWith(
      'reply-token',
      { type: 'text', text: 'reply' }
    );
    expect(bridge.lineService.pushMessage).not.toHaveBeenCalled();
    expect(result.messageId).toBe('line-reply-1');
  });

  test('falls back to quote-token push when replyToken is unusable', async () => {
    bridge.messageMappingManager.markReplyTokenUsed.mockResolvedValue(false);
    bridge.lineService.pushMessage.mockResolvedValue({ messageId: 'line-push-1' });

    await bridge.sendTrackedLineMessage(
      'U1',
      { type: 'text', text: 'late' },
      {
        replyToken: 'reply-token',
        replyTokenLineMessageId: 'line-origin',
        quoteToken: 'quote-origin'
      }
    );

    expect(bridge.lineService.pushMessage).toHaveBeenCalledWith('U1', {
      type: 'text',
      text: 'late',
      quoteToken: 'quote-origin'
    });
    expect(lineLimitHandler.recordMessageSent).toHaveBeenCalledTimes(1);
  });

  test('Discord content and attachments are mapped as 1:N LINE children', async () => {
    bridge.featureManager.resolveLineSendContext = jest.fn().mockResolvedValue({});
    bridge.mediaService.processDiscordAttachments.mockImplementation(
      async (_attachments, userId, trackedLineService) => {
        await trackedLineService.pushMessage(userId, {
          type: 'text',
          text: 'file link'
        });
        return [{ success: true }];
      }
    );
    bridge.lineService.pushMessage
      .mockResolvedValueOnce({ messageId: 'line-file-1' })
      .mockResolvedValueOnce({ messageId: 'line-text-1' });

    await bridge.processDiscordToLine({
      id: 'discord-1',
      channelId: 'C1',
      content: 'body',
      attachments: {
        size: 1,
        values: () => [{ name: 'file.pdf' }]
      },
      stickers: { size: 0 }
    }, 'U1');

    expect(bridge.messageMappingManager.mapDiscordToLines).toHaveBeenCalledWith(
      'discord-1',
      [
        expect.objectContaining({ lineMessageId: 'line-file-1', ordinal: 0 }),
        expect.objectContaining({ lineMessageId: 'line-text-1', ordinal: 1 })
      ],
      'U1',
      'C1'
    );
  });

  test('LINE messageEdited updates the mapped Discord webhook message', async () => {
    bridge.messageMappingManager.getLineToDiscordMapping.mockReturnValue({
      lineMessageId: 'line-1',
      discordMessageId: 'discord-1',
      discordChannelId: 'C1',
      lineUserId: 'U1',
      transport: 'webhook',
      webhookId: 'wh-1'
    });
    bridge.webhookManager = {
      editMessage: jest.fn(),
      deleteMessage: jest.fn()
    };

    await bridge.processLineEditToDiscord({
      type: 'messageEdited',
      source: { userId: 'U1' },
      message: { id: 'line-1', type: 'text', text: 'edited' }
    });

    expect(bridge.webhookManager.editMessage).toHaveBeenCalledWith(
      'C1',
      'discord-1',
      { content: 'edited' }
    );
  });

  test('ignores stale out-of-order LINE messageEdited events', async () => {
    bridge.messageMappingManager.getLineToDiscordMapping.mockReturnValue({
      lineMessageId: 'line-1',
      discordMessageId: 'discord-1',
      discordChannelId: 'C1',
      lineUserId: 'U1',
      transport: 'webhook',
      metadata: { lastEditTimestamp: 2000 }
    });
    bridge.webhookManager = {
      editMessage: jest.fn(),
      deleteMessage: jest.fn()
    };

    await bridge.processLineEditToDiscord({
      type: 'messageEdited',
      timestamp: 1000,
      source: { groupId: 'G1', userId: 'U1' },
      message: { id: 'line-1', type: 'text', text: 'stale edit' }
    });

    expect(bridge.webhookManager.editMessage).not.toHaveBeenCalled();
    expect(bridge.messageMappingManager.mapLineToDiscord).not.toHaveBeenCalled();
  });

  test('LINE unsend deletes the mapped Discord message and mapping', async () => {
    bridge.messageMappingManager.getLineToDiscordMapping.mockReturnValue({
      lineMessageId: 'line-1',
      discordMessageId: 'discord-1',
      discordChannelId: 'C1',
      transport: 'webhook'
    });
    bridge.webhookManager = {
      editMessage: jest.fn(),
      deleteMessage: jest.fn()
    };

    await bridge.processLineUnsendToDiscord({
      type: 'unsend',
      unsend: { messageId: 'line-1' }
    });

    expect(bridge.webhookManager.deleteMessage).toHaveBeenCalledWith('C1', 'discord-1');
    expect(bridge.messageMappingManager.removeMapping).toHaveBeenCalledWith('line-1', null);
  });

  test('metrics include message mapping statistics', () => {
    const metrics = bridge.getMetrics();
    expect(metrics.messagesProcessed).toBe(0);
    expect(metrics.errors).toBe(0);
    expect(metrics.messageMappings).toEqual({});
  });
});
