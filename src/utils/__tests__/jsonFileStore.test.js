const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { readJsonFile, writeJsonFileAtomic } = require('../jsonFileStore');

describe('jsonFileStore', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-file-store-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('writeJsonFileAtomic creates parent directories and writes readable JSON', async () => {
    const filePath = path.join(tempDir, 'nested', 'state.json');

    await writeJsonFileAtomic(filePath, { ok: true, count: 2 });

    await expect(readJsonFile(filePath)).resolves.toEqual({ ok: true, count: 2 });
  });

  test('writeJsonFileAtomic replaces existing JSON', async () => {
    const filePath = path.join(tempDir, 'state.json');

    await writeJsonFileAtomic(filePath, { version: 1 });
    await writeJsonFileAtomic(filePath, { version: 2 });

    await expect(readJsonFile(filePath)).resolves.toEqual({ version: 2 });
  });
});
