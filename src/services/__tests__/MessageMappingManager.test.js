const fs = require('fs').promises;
const os = require('os');
const path = require('path');

jest.mock('../../utils/logger');

const MessageMappingManager = require('../MessageMappingManager');

describe('MessageMappingManager reply token tracking', () => {
  let tempDir;
  let manager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'line-discord-bridge-'));
    manager = new MessageMappingManager();
    manager.mappingFile = path.join(tempDir, 'message-mappings.json');
    manager.tempMappingFile = `${manager.mappingFile}.tmp`;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  test('mapLineToDiscord stores replyToken with a one minute expiry', async () => {
    const before = Date.now();

    await manager.mapLineToDiscord(
      'line-1',
      'discord-1',
      'user-1',
      'channel-1',
      {
        replyToken: 'reply-token-1'
      }
    );

    const mapping = manager.getLineOriginByDiscordMessageId('discord-1');
    const expiry = new Date(mapping.replyTokenExpiry).getTime();

    expect(mapping.replyToken).toBe('reply-token-1');
    expect(expiry).toBeGreaterThanOrEqual(before + 59000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 61000);
  });

  test('markReplyTokenUsed records usage once', async () => {
    await manager.mapLineToDiscord(
      'line-1',
      'discord-1',
      'user-1',
      'channel-1',
      {
        replyToken: 'reply-token-1'
      }
    );

    await expect(manager.markReplyTokenUsed('line-1')).resolves.toBe(true);
    await expect(manager.markReplyTokenUsed('line-1')).resolves.toBe(false);

    const mapping = manager.getLineOriginByDiscordMessageId('discord-1');
    expect(mapping.replyTokenUsedAt).toEqual(expect.any(String));
  });

  test('markReplyTokenUsed rejects expired reply tokens', async () => {
    await manager.mapLineToDiscord(
      'line-1',
      'discord-1',
      'user-1',
      'channel-1',
      {
        replyToken: 'reply-token-1'
      }
    );
    const mapping = manager.getLineToDiscordMapping('line-1');
    mapping.replyTokenExpiry = new Date(Date.now() - 1000).toISOString();

    await expect(manager.markReplyTokenUsed('line-1')).resolves.toBe(false);
    expect(mapping.replyTokenUsedAt).toBeUndefined();
  });
});
