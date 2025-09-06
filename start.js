#!/usr/bin/env node

/**
 * PM2用の起動スクリプト
 * 環境変数を確実に読み込んでからapp.jsを起動
 */

const path = require('path');
const fs = require('fs');

// .envファイルの存在確認と読み込み
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✓ .env file loaded successfully');
} else {
  console.log('⚠ .env file not found, using system environment variables');
}

// 環境変数の確認
const requiredVars = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID'
];

let allPresent = true;
console.log('Environment variables status:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✓ OK' : '✗ MISSING';
  console.log(`${varName}: ${status}`);
  if (!value) allPresent = false;
});

if (!allPresent) {
  console.error('❌ Some required environment variables are missing');
  process.exit(1);
}

console.log('✓ All required environment variables are present');
console.log('Starting application...');

// app.jsを起動
require('./app.js');
