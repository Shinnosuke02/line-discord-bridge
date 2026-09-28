const Database = require('better-sqlite3');
const { initializeSchema } = require('../../infrastructure/sqlite');
const MessageLinkRepository = require('../MessageLinkRepository');

describe('MessageLinkRepository', () => {
  let db;
  let repository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    repository = new MessageLinkRepository(db);
  });

  afterEach(() => db.close());

  test('stores multiple LINE children for one Discord message in order', () => {
    repository.upsert({
      direction: 'discord_to_line',
      discordMessageId: 'D1',
      lineMessageId: 'L1',
      lineUserId: 'U1',
      discordChannelId: 'C1',
      ordinal: 0,
      messageType: 'image',
      transport: 'push'
    });
    repository.upsert({
      direction: 'discord_to_line',
      discordMessageId: 'D1',
      lineMessageId: 'L2',
      lineUserId: 'U1',
      discordChannelId: 'C1',
      ordinal: 1,
      messageType: 'text',
      transport: 'push'
    });

    expect(repository.getByDiscordMessageId('D1')).toEqual([
      expect.objectContaining({ lineMessageId: 'L1', ordinal: 0 }),
      expect.objectContaining({ lineMessageId: 'L2', ordinal: 1 })
    ]);
  });

  test('upserts LINE to Discord lifecycle metadata without duplicating the row', () => {
    repository.upsert({
      direction: 'line_to_discord',
      lineMessageId: 'L1',
      discordMessageId: 'D1',
      discordChannelId: 'C1',
      ordinal: 0,
      replyToken: 'r1',
      transport: 'webhook'
    });
    repository.upsert({
      direction: 'line_to_discord',
      lineMessageId: 'L1',
      discordMessageId: 'D1',
      discordChannelId: 'C1',
      ordinal: 0,
      quoteToken: 'q1',
      transport: 'webhook'
    });

    const rows = repository.getByLineMessageId('L1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      replyToken: 'r1',
      quoteToken: 'q1',
      transport: 'webhook'
    });
  });

  test('marks reply tokens used', () => {
    repository.upsert({
      direction: 'line_to_discord',
      lineMessageId: 'L1',
      discordMessageId: 'D1',
      ordinal: 0,
      replyToken: 'r1'
    });

    expect(repository.markReplyTokenUsed('L1', '2026-09-28T00:00:00.000Z')).toBe(1);
    expect(repository.getByLineMessageId('L1')[0].replyTokenUsedAt)
      .toBe('2026-09-28T00:00:00.000Z');
  });
});
