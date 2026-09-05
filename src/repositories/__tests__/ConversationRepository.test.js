const Database = require('better-sqlite3');
const ConversationRepository = require('../ConversationRepository');

function makeDatabase() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_source_id TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      discord_channel_id TEXT UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );
  `);
  return db;
}

describe('ConversationRepository', () => {
  let db;
  let repository;

  beforeEach(() => {
    db = makeDatabase();
    repository = new ConversationRepository(db);
  });

  afterEach(() => db.close());

  test('upserts a LINE source mapping and retrieves it both ways', () => {
    repository.upsert({
      sourceId: 'U123',
      discordChannelId: 'D456',
      channelName: 'Alice',
      createdAt: '2026-09-05T00:00:00.000Z',
      lastUsed: '2026-09-05T00:01:00.000Z'
    });

    expect(repository.getBySource('U123')).toMatchObject({
      line_source_id: 'U123',
      source_type: 'user',
      discord_channel_id: 'D456',
      display_name: 'Alice'
    });
    expect(repository.getByDiscordChannel('D456').line_source_id).toBe('U123');
    expect(repository.count()).toBe(1);
  });

  test('updates an existing source without creating a duplicate row', () => {
    repository.upsert({ sourceId: 'C123', discordChannelId: 'D1', channelName: 'old' });
    repository.upsert({ sourceId: 'C123', discordChannelId: 'D2', channelName: 'new' });

    expect(repository.count()).toBe(1);
    expect(repository.getBySource('C123')).toMatchObject({
      source_type: 'group',
      discord_channel_id: 'D2',
      display_name: 'new'
    });
  });

  test('enforces one Discord channel per conversation', () => {
    repository.upsert({ sourceId: 'U1', discordChannelId: 'D1' });
    expect(() => repository.upsert({ sourceId: 'U2', discordChannelId: 'D1' }))
      .toThrow();
  });
});
