const { getDatabase } = require('../infrastructure/sqlite');

class MessageLinkRepository {
  constructor(db = getDatabase()) {
    this.db = db;
    this.insertStatement = this.db.prepare(`
      INSERT INTO message_links (
        conversation_id,
        direction,
        line_message_id,
        discord_message_id,
        line_user_id,
        discord_channel_id,
        ordinal,
        message_type,
        transport,
        webhook_id,
        reply_token,
        reply_token_expiry,
        reply_token_used_at,
        quote_token,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        @conversation_id,
        @direction,
        @line_message_id,
        @discord_message_id,
        @line_user_id,
        @discord_channel_id,
        @ordinal,
        @message_type,
        @transport,
        @webhook_id,
        @reply_token,
        @reply_token_expiry,
        @reply_token_used_at,
        @quote_token,
        @metadata_json,
        @created_at,
        @updated_at
      )
      ON CONFLICT(direction, line_message_id, discord_message_id, ordinal)
      DO UPDATE SET
        line_user_id = excluded.line_user_id,
        discord_channel_id = excluded.discord_channel_id,
        message_type = excluded.message_type,
        transport = excluded.transport,
        webhook_id = excluded.webhook_id,
        reply_token = COALESCE(excluded.reply_token, message_links.reply_token),
        reply_token_expiry = COALESCE(excluded.reply_token_expiry, message_links.reply_token_expiry),
        reply_token_used_at = COALESCE(excluded.reply_token_used_at, message_links.reply_token_used_at),
        quote_token = COALESCE(excluded.quote_token, message_links.quote_token),
        metadata_json = COALESCE(excluded.metadata_json, message_links.metadata_json),
        updated_at = excluded.updated_at
    `);
    this.byLineStatement = this.db.prepare(`
      SELECT * FROM message_links
      WHERE line_message_id = ?
      ORDER BY ordinal ASC, id ASC
    `);
    this.byDiscordStatement = this.db.prepare(`
      SELECT * FROM message_links
      WHERE discord_message_id = ?
      ORDER BY ordinal ASC, id ASC
    `);
    this.allStatement = this.db.prepare(`
      SELECT * FROM message_links
      ORDER BY created_at ASC, id ASC
    `);
    this.markReplyUsedStatement = this.db.prepare(`
      UPDATE message_links
      SET reply_token_used_at = ?, updated_at = ?
      WHERE line_message_id = ? AND reply_token IS NOT NULL
    `);
    this.deleteByLineStatement = this.db.prepare('DELETE FROM message_links WHERE line_message_id = ?');
    this.deleteByDiscordStatement = this.db.prepare('DELETE FROM message_links WHERE discord_message_id = ?');
    this.deleteOlderThanStatement = this.db.prepare('DELETE FROM message_links WHERE created_at < ?');
  }

  upsert(mapping) {
    const now = new Date().toISOString();
    const row = {
      conversation_id: mapping.conversationId || null,
      direction: mapping.direction,
      line_message_id: mapping.lineMessageId || null,
      discord_message_id: mapping.discordMessageId || null,
      line_user_id: mapping.lineUserId || null,
      discord_channel_id: mapping.discordChannelId || null,
      ordinal: Number.isInteger(mapping.ordinal) ? mapping.ordinal : 0,
      message_type: mapping.messageType || null,
      transport: mapping.transport || null,
      webhook_id: mapping.webhookId || null,
      reply_token: mapping.replyToken || null,
      reply_token_expiry: mapping.replyTokenExpiry || null,
      reply_token_used_at: mapping.replyTokenUsedAt || null,
      quote_token: mapping.quoteToken || null,
      metadata_json: mapping.metadata ? JSON.stringify(mapping.metadata) : null,
      created_at: mapping.timestamp || now,
      updated_at: now
    };
    this.insertStatement.run(row);
    return row;
  }

  getByLineMessageId(lineMessageId) {
    return this.byLineStatement.all(lineMessageId).map((row) => this.toMapping(row));
  }

  getByDiscordMessageId(discordMessageId) {
    return this.byDiscordStatement.all(discordMessageId).map((row) => this.toMapping(row));
  }

  getAll() {
    return this.allStatement.all().map((row) => this.toMapping(row));
  }

  markReplyTokenUsed(lineMessageId, usedAt = new Date().toISOString()) {
    return this.markReplyUsedStatement.run(usedAt, usedAt, lineMessageId).changes;
  }

  deleteByLineMessageId(lineMessageId) {
    return this.deleteByLineStatement.run(lineMessageId).changes;
  }

  deleteByDiscordMessageId(discordMessageId) {
    return this.deleteByDiscordStatement.run(discordMessageId).changes;
  }

  deleteOlderThan(isoDate) {
    return this.deleteOlderThanStatement.run(isoDate).changes;
  }

  toMapping(row) {
    let metadata = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch (_) {
        metadata = null;
      }
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction,
      lineMessageId: row.line_message_id,
      discordMessageId: row.discord_message_id,
      lineUserId: row.line_user_id,
      discordChannelId: row.discord_channel_id,
      ordinal: row.ordinal,
      messageType: row.message_type,
      transport: row.transport,
      webhookId: row.webhook_id,
      replyToken: row.reply_token,
      replyTokenExpiry: row.reply_token_expiry,
      replyTokenUsedAt: row.reply_token_used_at,
      quoteToken: row.quote_token,
      metadata,
      timestamp: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = MessageLinkRepository;
