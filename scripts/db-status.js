#!/usr/bin/env node

const fs = require('fs');
const { getDatabase, closeDatabase, resolveDatabaseFile } = require('../src/infrastructure/sqlite');

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

    console.log(JSON.stringify({
      ok: quickCheck === 'ok',
      databaseFile,
      journalMode,
      quickCheck,
      counts
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
