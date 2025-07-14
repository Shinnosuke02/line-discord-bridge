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
const messageMapPath = './messageMap.json';
let userChannelMap = fs.existsSync(userChannelMapPath) ? JSON.parse(fs.readFileSync(userChannelMapPath)) : {};
let messageMap = fs.existsSync(messageMapPath) ? JSON.parse(fs.readFileSync(messageMapPath)) : {};

// === 重複検知用メモリキャッシュ ===
const recentMessages = new Map();
const MESSAGE_TTL = 3 * 60 * 1000;
function isDuplicate(id) {
  const ts = recentMessages.get(id);
  return ts && Date.now() - ts < MESSAGE_TTL;
}
function markAsProcessed(id) {
  recentMessages.set(id, Date.now());
}
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of recentMessages.entries()) {
    if (now - ts > MESSAGE_TTL) recentMessages.delete(id);
  }
}, 60 * 1000);

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

  if (isDuplicate(event.message.id)) return;

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

    let sent;
    const type = event.message.type;

    if (type === 'text') {
      sent = await channel.send(`${label}: ${event.message.text}`);
    } else if (type === 'image' || type === 'file') {
      const ext = type === 'image' ? 'jpg' : 'dat';
      const tmp = `./temp/${uuidv4()}.${ext}`;
      const stream = await lineClient.getMessageContent(event.message.id);
      const writer = fs.createWriteStream(tmp);
      await new Promise((res, rej) => {
        stream.pipe(writer);
        writer.on('finish', res);
        writer.on('error', rej);
      });
      sent = await channel.send({ content: `📎 ${label} sent a ${type}:`, files: [tmp] });
      fs.unlink(tmp, () => {});
    } else if (type === 'sticker') {
      const url = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/android/sticker.png`;
      sent = await channel.send({ content: `🎴 ${label} sent a sticker:`, files: [url] });
    } else {
      sent = await channel.send(`${label} sent a ${type} message.`);
    }

    messageMap[event.message.id] = sent.id;
    fs.writeFileSync(messageMapPath, JSON.stringify(messageMap, null, 2));
    markAsProcessed(event.message.id);
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
    for (const att of message.attachments.values()) {
      const isImg = (att.contentType || '').startsWith('image/');
      if (isImg) {
        await lineClient.pushMessage(userId, {
          type: 'image',
          originalContentUrl: att.url,
          previewImageUrl: att.url,
        });
      } else {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `📎 添付ファイル: ${att.name}\n${att.url}`,
        });
      }
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
if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
