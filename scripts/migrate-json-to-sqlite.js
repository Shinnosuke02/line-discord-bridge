#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ConversationRepository = require('../src/repositories/ConversationRepository');
const { getDatabase, closeDatabase, resolveDatabaseFile } = require('../src/infrastructure/sqlite');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

function migrateChannelMappings() {
  const sourceFile = path.join(process.cwd(), 'data', 'channel-mappings.json');
  const mappings = readJsonIfExists(sourceFile);
  if (!mappings) {
    return { sourceFile, found: false, migrated: 0 };
  }

  const repository = new ConversationRepository(getDatabase());
  let migrated = 0;

  const transaction = getDatabase().transaction(() => {
    for (const [sourceId, value] of Object.entries(mappings)) {
      if (!value?.discordChannelId) {
        continue;
      }

      repository.upsert({
        ...value,
        sourceId: value.sourceId || sourceId
      });
      migrated += 1;
    }
  });

  transaction();
  return { sourceFile, found: true, migrated };
}

function main() {
  try {
    const result = migrateChannelMappings();
    console.log(JSON.stringify({
      ok: true,
      databaseFile: resolveDatabaseFile(),
      channelMappings: result
    }, null, 2));
  } finally {
    closeDatabase();
  }
}

main();
