require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { middleware, Client: LineClient } = require('@line/bot-sdk');
const fs = require('fs');
const getRawBody = require('raw-body');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

// === LINE 設定 ===
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new LineClient(lineConfig);

// === Discord 設定 ===
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// === 永続ファイル ===
const userChannelMapPath = './userChannelMap.json';
let userChannelMap = fs.existsSync(userChannelMapPath) ? JSON.parse(fs.readFileSync(userChannelMapPath)) : {};

// === Discordチャンネル作成 ===
async function getOrCreateChannel(displayName, userId) {
  const guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID);
  if (userChannelMap[userId]) {
    try {
      await guild.channels.fetch(userChannelMap[userId]);
      return userChannelMap[userId];
    } catch {
      delete userChannelMap[userId];
    }
  }

  const baseName = displayName.replace(/[^\p{L}\p{N}_\-]/gu, '-').slice(0, 85);
  let channelName = '';
  for (let i = 1; i <= 999; i++) {
    const suffix = `-${String(i).padStart(3, '0')}`;
    const proposed = `${baseName}${suffix}`;
    if (!guild.channels.cache.find(c => c.name === proposed)) {
      channelName = proposed;
      break;
    }
  }
  const newChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    reason: `LINE user ${displayName}`,
  });
  userChannelMap[userId] = newChannel.id;
  fs.writeFileSync(userChannelMapPath, JSON.stringify(userChannelMap, null, 2));
  return newChannel.id;
}

// === LINE → Discord メッセージ処理 ===
async function handleEvent(event) {
  if (event.type !== 'message') return;
  const sourceId = event.source.groupId || event.source.userId;
  const senderId = event.source.userId;
  const isGroup = !!event.source.groupId;
  let displayName = sourceId;

  try {
    if (isGroup) {
      try {
        const member = await lineClient.getGroupMemberProfile(sourceId, senderId);
        displayName = member.displayName;
      } catch {
        const group = await lineClient.getGroupSummary(sourceId);
        displayName = group.groupName || `group-${sourceId.slice(0, 8)}`;
      }
    } else {
      const profile = await lineClient.getProfile(senderId);
      displayName = profile.displayName;
    }

    const channelId = await getOrCreateChannel(displayName, sourceId);
    const channel = await discordClient.channels.fetch(channelId);
    const label = `**${displayName}**`;

    const type = event.message.type;

    if (type === 'text') {
      await channel.send(`${label}: ${event.message.text}`);
    } else {
      await channel.send(`${label} sent a ${type} message.`);
    }
  } catch (err) {
    console.error('LINE → Discord error:', err);
  }
}

// === Discord → LINE メッセージ処理 ===
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const userId = Object.keys(userChannelMap).find(k => userChannelMap[k] === message.channel.id);
  if (!userId) return;

  try {
    if (message.content) {
      await lineClient.pushMessage(userId, { type: 'text', text: message.content });
    }
  } catch (err) {
    console.error('Discord → LINE error:', err);
  }
});

// === Webhook エンドポイント ===
app.post('/webhook',
  (req, res, next) => {
    getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: req.charset || 'utf-8',
    }, (err, string) => {
      if (err) return next(err);
      req.rawBody = string;
      try { req.body = JSON.parse(string); } catch { req.body = {}; }
      next();
    });
  },
  middleware(lineConfig),
  async (req, res) => {
    try {
      for (const event of req.body.events) {
        await handleEvent(event);
      }
      res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(500).send('NG');
    }
  }
);

// === 初期化処理 ===
discordClient.once('ready', () => console.log('✅ Discord bot ready'));
discordClient.login(process.env.DISCORD_BOT_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
