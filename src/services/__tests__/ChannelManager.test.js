jest.mock('../../utils/logger');

const ChannelManager = require('../ChannelManager');

describe('ChannelManager', () => {
  let discordClient;
  let lineService;
  let channelManager;

  beforeEach(() => {
    discordClient = {
      channels: {
        fetch: jest.fn()
      },
      guilds: {
        fetch: jest.fn()
      }
    };
    lineService = {
      getGroupSummary: jest.fn(),
      getUserProfile: jest.fn()
    };
    channelManager = new ChannelManager(discordClient, lineService);
    channelManager.saveMappings = jest.fn().mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getChannelMapping returns an existing mapping by LINE source ID', () => {
    const mapping = {
      sourceId: 'Cgroup-1',
      discordChannelId: 'discord-channel-1',
      channelName: 'old-group',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsed: '2026-01-01T00:00:00.000Z'
    };
    channelManager.mappings.set(mapping.sourceId, mapping);

    expect(channelManager.getChannelMapping('Cgroup-1')).toBe(mapping);
  });

  test('getChannelMapping returns null for unknown source ID', () => {
    expect(channelManager.getChannelMapping('Cmissing')).toBeNull();
  });

  test('updateChannelName updates the Discord channel and stored group mapping', async () => {
    const mapping = {
      sourceId: 'Cgroup-1',
      discordChannelId: 'discord-channel-1',
      channelName: 'old-group',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsed: '2026-01-01T00:00:00.000Z'
    };
    const channel = {
      setName: jest.fn().mockResolvedValue()
    };
    channelManager.mappings.set(mapping.sourceId, mapping);
    discordClient.channels.fetch.mockResolvedValue(channel);

    const result = await channelManager.updateChannelName('Cgroup-1', 'new-group');

    expect(result).toBe(true);
    expect(discordClient.channels.fetch).toHaveBeenCalledWith('discord-channel-1');
    expect(channel.setName).toHaveBeenCalledWith('new-group');
    expect(channelManager.getChannelMapping('Cgroup-1')).toMatchObject({
      sourceId: 'Cgroup-1',
      discordChannelId: 'discord-channel-1',
      channelName: 'new-group'
    });
    expect(channelManager.saveMappings).toHaveBeenCalledTimes(1);
  });
});
