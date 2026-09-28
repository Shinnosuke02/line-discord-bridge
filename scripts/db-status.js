#!/usr/bin/env node

const fs = require('fs');
const { getDatabase, closeDatabase, resolveDatabaseFile } = require('../src/infrastructure/sqlite');

function rowsToObject(rows, key, value) {
  return Object.fromEntries(rows.map((row) => [row[key], row[value]]));
}

function main() {
  const databaseFile = resolveDatabaseFile();
  if (!fs.existsSync(databaseFile)) {
    throw new Error(`SQLite database does not exist: ${databaseFile}`);
  }

  const db = getDatabase();
  try {
    const quickCheck = db.pragma('quick_check', { simple: true });
    const journalMode = db.pragma('journal_mode', { simple: true });
    const counts = {};

    for (const table of ['conversations', 'webhook_events', 'message_links']) {
      counts[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    }

    const webhookStatuses = rowsToObject(
      db.prepare(`
        SELECT status, COUNT(*) AS count
        FROM webhook_events
        GROUP BY status
        ORDER BY status
      `).all(),
      'status',
      'count'
    );

    const messageDirections = rowsToObject(
      db.prepare(`
        SELECT direction, COUNT(*) AS count
        FROM message_links
        GROUP BY direction
        ORDER BY direction
      `).all(),
      'direction',
      'count'
    );

    console.log(JSON.stringify({
      ok: quickCheck === 'ok',
      databaseFile,
      journalMode,
      quickCheck,
      counts,
      webhookStatuses,
      messageDirections
    }, null, 2));

    if (quickCheck !== 'ok') {
      process.exitCode = 1;
    }
  } finally {
    closeDatabase();
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  closeDatabase();
  process.exitCode = 1;
}
