const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../utils/logger');

let database = null;

function resolveDatabaseFile() {
  const configuredPath = process.env.DB_FILE;
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  const basePath = config.database?.path || './data';
  return path.resolve(basePath, 'bridge.sqlite3');
}

function getColumnNames(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name));
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = getColumnNames(db, tableName);
  if (columns.has(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      webhook_event_id TEXT PRIMARY KEY,
      line_message_id TEXT,
      source_id TEXT,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_source_id TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      discord_channel_id TEXT UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      direction TEXT NOT NULL,
      line_message_id TEXT,
      discord_message_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
  `);

  ensureColumn(db, 'webhook_events', 'next_attempt_at', 'TEXT');
  ensureColumn(db, 'webhook_events', 'dead_lettered_at', 'TEXT');

  ensureColumn(db, 'message_links', 'line_user_id', 'TEXT');
  ensureColumn(db, 'message_links', 'discord_channel_id', 'TEXT');
  ensureColumn(db, 'message_links', 'ordinal', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'message_links', 'message_type', 'TEXT');
  ensureColumn(db, 'message_links', 'transport', 'TEXT');
  ensureColumn(db, 'message_links', 'webhook_id', 'TEXT');
  ensureColumn(db, 'message_links', 'reply_token', 'TEXT');
  ensureColumn(db, 'message_links', 'reply_token_expiry', 'TEXT');
  ensureColumn(db, 'message_links', 'reply_token_used_at', 'TEXT');
  ensureColumn(db, 'message_links', 'quote_token', 'TEXT');
  ensureColumn(db, 'message_links', 'metadata_json', 'TEXT');
  ensureColumn(db, 'message_links', 'updated_at', 'TEXT');

  db.exec(`
    UPDATE message_links
    SET updated_at = COALESCE(updated_at, created_at)
    WHERE updated_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_webhook_events_status
      ON webhook_events(status, received_at);

    CREATE INDEX IF NOT EXISTS idx_webhook_events_due
      ON webhook_events(status, next_attempt_at, received_at);

    CREATE INDEX IF NOT EXISTS idx_message_links_line
      ON message_links(line_message_id);

    CREATE INDEX IF NOT EXISTS idx_message_links_discord
      ON message_links(discord_message_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_links_unique
      ON message_links(direction, line_message_id, discord_message_id, ordinal);
  `);
}

function getDatabase() {
  if (database) {
    return database;
  }

  const databaseFile = resolveDatabaseFile();
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  database = new Database(databaseFile);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  initializeSchema(database);

  logger.info('SQLite database initialized', {
    databaseFile,
    journalMode: database.pragma('journal_mode', { simple: true })
  });

  return database;
}

function closeDatabase() {
  if (!database) {
    return;
  }

  database.close();
  database = null;
  logger.info('SQLite database closed');
}

module.exports = {
  getDatabase,
  closeDatabase,
  resolveDatabaseFile,
  initializeSchema
};
