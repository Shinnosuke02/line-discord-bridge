const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { LineLimitHandler } = require('../lineLimitHandler');

jest.mock('../../utils/logger');

describe('LineLimitHandler persistence', () => {
  let tempDir;
  let usageFile;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'line-usage-'));
    usageFile = path.join(tempDir, 'line-usage.json');
  });

  afterEach(async () => {
    jest.useRealTimers();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('initialize loads usage count for the current month', async () => {
    await fs.writeFile(usageFile, JSON.stringify({
      monthlyMessageCount: 12,
      lastResetDate: 6,
      lastResetYear: 2026,
      isLimitReached: false
    }));

    const handler = new LineLimitHandler({ usageFile });

    await handler.initialize();

    expect(handler.getLimitStatus().monthlyCount).toBe(12);
  });

  test('initialize resets stale usage from a previous month', async () => {
    await fs.writeFile(usageFile, JSON.stringify({
      monthlyMessageCount: 180,
      lastResetDate: 5,
      lastResetYear: 2026,
      isLimitReached: true
    }));

    const handler = new LineLimitHandler({ usageFile });

    await handler.initialize();

    const persisted = JSON.parse(await fs.readFile(usageFile, 'utf8'));
    expect(handler.getLimitStatus().monthlyCount).toBe(0);
    expect(persisted.monthlyMessageCount).toBe(0);
    expect(persisted.lastResetDate).toBe(6);
    expect(persisted.lastResetYear).toBe(2026);
    expect(persisted.isLimitReached).toBe(false);
  });

  test('recordMessageSent persists the updated count', async () => {
    const handler = new LineLimitHandler({ usageFile });
    await handler.initialize();

    handler.recordMessageSent();
    await handler.saveQueue;

    const persisted = JSON.parse(await fs.readFile(usageFile, 'utf8'));
    expect(persisted.monthlyMessageCount).toBe(1);
  });
});
