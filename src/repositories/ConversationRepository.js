const { getDatabase } = require('../infrastructure/sqlite');

class ConversationRepository {
  constructor(db = getDatabase()) {
    this.db = db;

    this.upsertStatement = this.db.prepare(`
      INSERT INTO conversations (
        line_source_id,
        source_type,
        discord_channel_id,
        display_name,
        created_at,
        last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(line_source_id) DO UPDATE SET
        source_type = excluded.source_type,
        discord_channel_id = excluded.discord_channel_id,
        display_name = COALESCE(excluded.display_name, conversations.display_name),
        last_used_at = excluded.last_used_at
    `);

    this.getBySourceStatement = this.db.prepare(`
      SELECT * FROM conversations WHERE line_source_id = ?
    `);

    this.getByDiscordChannelStatement = this.db.prepare(`
      SELECT * FROM conversations WHERE discord_channel_id = ?
    `);

    this.listAllStatement = this.db.prepare(`
      SELECT * FROM conversations ORDER BY id ASC
    `);

    this.deleteBySourceStatement = this.db.prepare(`
      DELETE FROM conversations WHERE line_source_id = ?
    `);

    this.touchBySourceStatement = this.db.prepare(`
      UPDATE conversations SET last_used_at = ? WHERE line_source_id = ?
    `);

    this.countStatement = this.db.prepare('SELECT COUNT(*) AS count FROM conversations');
  }

  inferSourceType(sourceId) {
    if (sourceId?.startsWith('C')) return 'group';
    if (sourceId?.startsWith('R')) return 'room';
    if (sourceId?.startsWith('U')) return 'user';
    return 'unknown';
  }

  upsert(mapping) {
    if (!mapping?.sourceId) {
      throw new Error('Conversation mapping requires sourceId');
    }
    if (!mapping?.discordChannelId) {
      throw new Error('Conversation mapping requires discordChannelId');
    }

    const now = new Date().toISOString();
    const createdAt = mapping.createdAt || now;
    const lastUsedAt = mapping.lastUsed || mapping.lastUsedAt || now;

    this.upsertStatement.run(
      mapping.sourceId,
      mapping.sourceType || this.inferSourceType(mapping.sourceId),
      mapping.discordChannelId,
      mapping.channelName || mapping.displayName || null,
      createdAt,
      lastUsedAt
    );

    return this.getBySource(mapping.sourceId);
  }

  getBySource(sourceId) {
    return this.getBySourceStatement.get(sourceId) || null;
  }

  getByDiscordChannel(discordChannelId) {
    return this.getByDiscordChannelStatement.get(discordChannelId) || null;
  }

  listAll() {
    return this.listAllStatement.all();
  }

  deleteBySource(sourceId) {
    return this.deleteBySourceStatement.run(sourceId).changes === 1;
  }

  touch(sourceId, timestamp = new Date().toISOString()) {
    return this.touchBySourceStatement.run(timestamp, sourceId).changes === 1;
  }

  count() {
    return this.countStatement.get().count;
  }
}

module.exports = ConversationRepository;
