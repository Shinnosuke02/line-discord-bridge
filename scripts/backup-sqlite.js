#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase, resolveDatabaseFile } = require('../src/infrastructure/sqlite');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const databaseFile = resolveDatabaseFile();
  if (!fs.existsSync(databaseFile)) {
    throw new Error(`SQLite database does not exist: ${databaseFile}`);
  }

  const backupDir = process.env.DB_BACKUP_PATH
    ? path.resolve(process.env.DB_BACKUP_PATH)
    : path.join(path.dirname(databaseFile), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const destination = path.join(backupDir, `bridge-${timestamp()}.sqlite3`);
  const db = getDatabase();

  try {
    await db.backup(destination);
    console.log(JSON.stringify({
      ok: true,
      databaseFile,
      backupFile: destination
    }, null, 2));
  } finally {
    closeDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  closeDatabase();
  process.exitCode = 1;
});
