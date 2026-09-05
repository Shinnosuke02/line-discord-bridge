jest.mock('../../utils/logger');

const ChannelManager = require('../ChannelManager');
const PersistentChannelManager = require('../PersistentChannelManager');
const config = require('../../config');

function createRepository(overrides = {}) {
  return {
    count: jest.fn(() => 0),
    listAll: jest.fn(() => []),
    upsert: jest.fn(),
    deleteBySource: jest.fn(),
    touch: jest.fn(),
    ...overrides
  };
}

function createManager(repository = createRepository()) {
  const discordClient = {
    channels: { fetch: jest.fn() },
    guilds: { fetch: jest.fn() }
  };
  const lineService = {
    getGroupSummary: jest.fn(),
    getUserProfile: jest.fn()
  };

  return {
    manager: new PersistentChannelManager(discordClient, lineService, {
      conversationRepository: repository
    }),
    discordClient,
    lineService,
    repository
  };
}

describe('PersistentChannelManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('serializes concurrent first-message channel creation for one LINE source', async () => {
    const { manager } = createManager(null);
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const superGet = jest.spyOn(ChannelManager.prototype, 'getOrCreateChannel')
      .mockImplementation(async sourceId => {
        await blocked;
        return {
          sourceId,
          discordChannelId: 'discord-created-once',
          channelName: 'group-race'
        };
      });

    const first = manager.getOrCreateChannel('Cgroup-race');
    const second = manager.getOrCreateChannel('Cgroup-race');
    release();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(superGet).toHaveBeenCalledTimes(1);
    expect(firstResult.discordChannelId).toBe('discord-created-once');
    expect(secondResult.discordChannelId).toBe('discord-created-once');
  });

  test('loads SQLite mappings without falling back to legacy JSON when DB already has data', async () => {
    const repository = createRepository({
      count: jest.fn(() => 1),
      listAll: jest.fn(() => [{
        line_source_id: 'U1',
        discord_channel_id: 'D1',
        display_name: 'Alice',
        created_at: '2026-01-01T00:00:00.000Z',
        last_used_at: '2026-01-02T00:00:00.000Z'
      }])
    });
    const { manager } = createManager(repository);
    const legacyLoad = jest.spyOn(ChannelManager.prototype, 'loadMappings');

    await manager.loadMappings();

    expect(legacyLoad).not.toHaveBeenCalled();
    expect(manager.getChannelMapping('U1')).toMatchObject({
      discordChannelId: 'D1',
      channelName: 'Alice'
    });
  });

  test('mirrors legacy JSON mappings into SQLite during first migration', async () => {
    const repository = createRepository();
    const { manager } = createManager(repository);
    jest.spyOn(ChannelManager.prototype, 'loadMappings').mockImplementation(async function loadLegacy() {
      this.mappings.set('C1', {
        sourceId: 'C1',
        discordChannelId: 'D1',
        channelName: 'Group One',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsed: '2026-01-02T00:00:00.000Z'
      });
    });

    await manager.loadMappings();

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'C1',
      discordChannelId: 'D1'
    }));
  });

  test('new Discord channels inherit permissions and do not expose LINE source IDs in topic', async () => {
    const repository = createRepository();
    const { manager, discordClient } = createManager(repository);
    const originalGuildId = config.discord.guildId;
    const originalGroupsCategory = config.discord.categories.groups;
    config.discord.guildId = 'guild-1';
    config.discord.categories.groups = 'category-1';

    manager.generateChannelName = jest.fn().mockResolvedValue('テストグループ');
    const create = jest.fn().mockResolvedValue({ id: 'D-new', name: 'テストグループ' });
    discordClient.guilds.fetch.mockResolvedValue({ channels: { create } });

    try {
      const mapping = await manager.createNewChannel('C-secret-source-id');
      const options = create.mock.calls[0][0];

      expect(mapping.discordChannelId).toBe('D-new');
      expect(options.parent).toBe('category-1');
      expect(options.topic).toBe('LINE Bridge Channel');
      expect(options.topic).not.toContain('C-secret-source-id');
      expect(options.permissionOverwrites).toBeUndefined();
    } finally {
      config.discord.guildId = originalGuildId;
      config.discord.categories.groups = originalGroupsCategory;
    }
  });
});
