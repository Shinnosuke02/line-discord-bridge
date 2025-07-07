require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { middleware, Client: LineClient } = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const getRawBody = require('raw-body');

const app = express();

// LINE設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new LineClient(lineConfig);

// Discordクライアント
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// rawBodyを取得して署名検証可能に
app.use('/webhook', (req, res, next) => {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: true
  }, (err, string) => {
    if (err) return next(err);
    req.rawBody = string;
    next();
  });
}, middleware(lineConfig));

// LINEイベント処理
app.post('/webhook', async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || !event.message) return;

  const displayName = await getUserDisplayName(event.source);
  const channelId = await getOrCreateChannel(event, displayName);
  const channel = await discordClient.channels.fetch(channelId);

  let content = '';

  switch (event.message.type) {
    case 'text':
      content = `**${displayName}**: ${event.message.text}`;
      break;
    case 'image':
      content = `**${displayName}** が画像を送信しました (取得省略)`;
      break;
    case 'sticker':
      content = `**${displayName}** がスタンプを送信しました`;
      break;
    default:
      content = `**${displayName}** が ${event.message.type} を送信しました`;
  }

  if (content) await channel.send(content);
}

async function getUserDisplayName(source) {
  try {
    if (source.type === 'user') {
      const profile = await lineClient.getProfile(source.userId);
      return profile.displayName;
    } else if (source.type === 'group') {
      const profile = await lineClient.getGroupMemberProfile(source.groupId, source.userId);
      return profile.displayName;
    } else if (source.type === 'room') {
      const profile = await lineClient.getRoomMemberProfile(source.roomId, source.userId);
      return profile.displayName;
    }
  } catch (e) {
    return 'Unknown';
  }
}

async function getOrCreateChannel(event, displayName) {
  const guild = await discordClient.guilds.fetch(process.env.DISCORD_SERVER_ID);
  const channels = await guild.channels.fetch();
  const channelName = `line-${displayName.toLowerCase().replace(/\\s+/g, '-')}`;

  let existing = [...channels.values()].find(c => c.name === channelName);
  if (!existing) {
    existing = await guild.channels.create({
      name: channelName,
      type: 0, // TEXT
      reason: 'LINEユーザーとの同期用',
    });
  }

  return existing.id;
}

// Discord -> LINE （最小構成。将来的に追加）
discordClient.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  console.log(`[Discord → LINE] ${msg.author.username}: ${msg.content}`);
  // ※個別ユーザーへの対応が必要ならここに実装
});

// Discord準備完了
discordClient.once('ready', () => {
  console.log('✅ Discord bot ready');
});

discordClient.login(process.env.DISCORD_BOT_TOKEN);

// Express起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
