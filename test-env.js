#!/usr/bin/env node

// 環境変数読み込みテスト
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('=== Environment Variables Test ===');
console.log('Current working directory:', process.cwd());
console.log('.env file path:', path.join(__dirname, '.env'));

console.log('\n=== Required Environment Variables ===');
const requiredVars = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID'
];

let allPresent = true;
requiredVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✓ OK' : '✗ MISSING';
  console.log(`${varName}: ${status}`);
  if (value) {
    console.log(`  Value: ${value.substring(0, 10)}...`);
  }
  if (!value) allPresent = false;
});

console.log('\n=== Optional Environment Variables ===');
const optionalVars = [
  'PORT',
  'WEBHOOK_ENABLED',
  'WEBHOOK_NAME',
  'UPLOAD_API_KEY',
  'UPLOAD_EXPIRE_DAYS',
  'MAX_IMAGE_SIZE',
  'UPLOAD_DIR',
  'PUBLIC_BASE_URL'
];

optionalVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✓ SET' : '- NOT SET';
  console.log(`${varName}: ${status}`);
});

console.log('\n=== Test Result ===');
if (allPresent) {
  console.log('✓ All required environment variables are present');
  process.exit(0);
} else {
  console.log('✗ Some required environment variables are missing');
  process.exit(1);
}
