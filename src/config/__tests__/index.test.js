const fs = require('fs');
const os = require('os');
const path = require('path');

const originalEnv = process.env;

function makeBaseEnv(baseDir) {
  return {
    ...originalEnv,
    NODE_ENV: 'test',
    LINE_CHANNEL_SECRET: 'line-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
    DISCORD_BOT_TOKEN: 'discord-token',
    DISCORD_GUILD_ID: '1234567890',
    UPLOAD_PATH: path.join(baseDir, 'uploads'),
    TEMP_PATH: path.join(baseDir, 'temp'),
    LOG_DIR: path.join(baseDir, 'logs'),
    DB_PATH: path.join(baseDir, 'data'),
    // Prevent the repository's .env.test from re-populating values that a
    // validation test intentionally removes from process.env.
    DOTENV_CONFIG_PATH: path.join(baseDir, 'empty.env')
  };
}

describe('config validation', () => {
  let baseDir;

  beforeEach(() => {
    jest.resetModules();
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-discord-config-'));
    fs.writeFileSync(path.join(baseDir, 'empty.env'), '', 'utf8');
    process.env = makeBaseEnv(baseDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  test('requires DISCORD_GUILD_ID at startup', () => {
    delete process.env.DISCORD_GUILD_ID;

    expect(() => require('../index')).toThrow('DISCORD_GUILD_ID is required');
  });

  test('enables video compression only when explicitly true', () => {
    process.env.VIDEO_COMPRESSION_ENABLED = 'true';
    let config;
    jest.isolateModules(() => {
      config = require('../index');
    });
    expect(config.media.videoCompression.enabled).toBe(true);

    jest.resetModules();
    process.env.VIDEO_COMPRESSION_ENABLED = 'false';
    jest.isolateModules(() => {
      config = require('../index');
    });
    expect(config.media.videoCompression.enabled).toBe(false);
  });
});
