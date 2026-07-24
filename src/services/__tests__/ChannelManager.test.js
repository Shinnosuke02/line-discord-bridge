jest.mock('../../utils/logger');

const ChannelManager = require('../ChannelManager');
const config = require('../../config');

describe('ChannelManager', () => {
  let discordClient;
  let lineService;
  let channelManager;
  let originalCategories;

  beforeEach(() => {
    originalCategories = config.discord.categories;
    config.discord.categories = {
      friends: 'friends-category-id',
      groups: 'groups-category-id',
      shop: null,
      test: null,
      archive: null
    };
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
    config.discord.categories = originalCategories;
    jest.clearAllMocks();
  });

  test('getCategoryForSource selects the Friends category for a LINE user', () => {
    expect(channelManager.getCategoryForSource('U1234567890')).toBe('friends-category-id');
  });

  test('getCategoryForSource selects the Groups category for a LINE group', () => {
    expect(channelManager.getCategoryForSource('C1234567890')).toBe('groups-category-id');
  });

  test('getCategoryForSource returns null for unknown source types', () => {
    expect(channelManager.getCategoryForSource('X1234567890')).toBeNull();
  });

  test('getCategoryForSource returns null when category assignment is disabled', () => {
    config.discord.categories.friends = null;
    expect(channelManager.getCategoryForSource('U1234567890')).toBeNull();

    config.discord.categories.groups = 'null';
    expect(channelManager.getCategoryForSource('C1234567890')).toBeNull();
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
