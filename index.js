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

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new LineClient(lineConfig);

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

discordClient.once('ready', () => {
  console.log('✅ Discord bot ready');
});

discordClient.login(process.env.DISCORD_BOT_TOKEN);

const userChannelMapPath = './userChannelMap.json';
let userChannelMap = {};
if (fs.existsSync(userChannelMapPath)) {
  userChannelMap = JSON.parse(fs.readFileSync(userChannelMapPath, 'utf-8'));
}

const messageMapPath = './messageMap.json';
let messageMap = {};
if (fs.existsSync(messageMapPath)) {
  messageMap = JSON.parse(fs.readFileSync(messageMapPath, 'utf-8'));
}

if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp');
}

const recentMessages = new Map();
const MESSAGE_TTL_MS = 3 * 60 * 1000;

function isDuplicate(lineMsgId) {
  const ts = recentMessages.get(lineMsgId);
  if (!ts) return false;
  return Date.now() - ts < MESSAGE_TTL_MS;
}

function markAsProcessed(lineMsgId) {
  recentMessages.set(lineMsgId, Date.now());
}

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentMessages.entries()) {
    if (now - ts > MESSAGE_TTL_MS) recentMessages.delete(key);
  }
}, 60 * 1000);

async function getOrCreateChannel(displayName, userId) {
  let guild = discordClient.guilds.cache.get(process.env.DISCORD_GUILD_ID);

  if (!guild) {
    try {
      guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID);
    } catch (e) {
      throw new Error('Guild not found. Check DISCORD_GUILD_ID and bot permissions.');
    }
  }

  if (userChannelMap[userId]) {
    const existing = guild.channels.cache.get(userChannelMap[userId]) || await guild.channels.fetch(userChannelMap[userId]).catch(() => null);
    if (existing) return userChannelMap[userId];
    delete userChannelMap[userId];
    fs.writeFileSync(userChannelMapPath, JSON.stringify(userChannelMap, null, 2));
  }

  const baseName = displayName.replace(/[^\p{L}\p{N}_\-]/gu, '-').slice(0, 85);
  let channelName = baseName;

  for (let i = 1; i <= 999; i++) {
    const suffix = `-${String(i).padStart(3, '0')}`;
    const proposedName = `${baseName}${suffix}`;
    const exists = guild.channels.cache.find(
      (c) => c.name === proposedName && c.type === ChannelType.GuildText
    );
    if (!exists) {
      channelName = proposedName;
      break;
    }
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    reason: `LINE user ${displayName} sync`,
  });

  userChannelMap[userId] = channel.id;
  fs.writeFileSync(userChannelMapPath, JSON.stringify(userChannelMap, null, 2));
  return channel.id;
}

async function handleEvent(event) {
  if (event.type !== 'message') return;
  const sourceId = event.source.groupId || event.source.userId;
  const senderId = event.source.userId;
  const isGroup = !!event.source.groupId;
  let displayName = sourceId;

  if (isDuplicate(event.message.id)) {
    console.log(`⏩ Duplicate message ignored: ${event.message.id}`);
    return;
  }
  markAsProcessed(event.message.id);

  try {
    if (isGroup) {
      try {
        const memberProfile = await lineClient.getGroupMemberProfile(sourceId, senderId);
        displayName = memberProfile.displayName;
      } catch {
        const groupSummary = await lineClient.getGroupSummary(sourceId);
        displayName = groupSummary.groupName || `group-${sourceId.slice(0, 8)}`;
      }
    } else {
      const profile = await lineClient.getProfile(senderId);
      displayName = profile.displayName;
    }

    const channelId = await getOrCreateChannel(displayName, sourceId);
    const channel = await discordClient.channels.fetch(channelId);

    const label = `**${displayName}**`;
    const msgType = event.message.type;

    let sentMessage;
    if (msgType === 'text') {
      sentMessage = await channel.send(`${label}: ${event.message.text}`);
    } else if (msgType === 'image' || msgType === 'file') {
      const ext = msgType === 'image' ? 'jpg' : 'dat';
      const tmpFile = `./temp/${uuidv4()}.${ext}`;
      const stream = await lineClient.getMessageContent(event.message.id);
      const writer = fs.createWriteStream(tmpFile);

      await new Promise((resolve, reject) => {
        stream.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      sentMessage = await channel.send({
        content: `📎 ${label} sent a ${msgType}:`,
        files: [tmpFile],
      });

      fs.unlink(tmpFile, () => {});
    } else if (msgType === 'sticker') {
      const stickerId = event.message.stickerId;
      const stickerUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
      sentMessage = await channel.send({ content: `🎴 ${label} sent a sticker:`, files: [stickerUrl] });
    } else {
      sentMessage = await channel.send(`📎 ${label} sent a ${msgType} message.`);
    }

    messageMap[event.message.id] = sentMessage.id;
    fs.writeFileSync(messageMapPath, JSON.stringify(messageMap, null, 2));
  } catch (err) {
    console.error('LINE → Discord error:', err);
  }
}

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild || !message.channel) return;

  const userId = Object.keys(userChannelMap).find((key) => userChannelMap[key] === message.channel.id);
  if (!userId) return;

  try {
    if (message.content) {
      await lineClient.pushMessage(userId, {
        type: 'text',
        text: message.content,
      });
    }

    for (const attachment of message.attachments.values()) {
      const mimeType = attachment.contentType || '';
      const isImage = mimeType.startsWith('image/');

      if (isImage) {
        await lineClient.pushMessage(userId, {
          type: 'image',
          originalContentUrl: attachment.url,
          previewImageUrl: attachment.url,
        });
      } else {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `📎 添付ファイル: ${attachment.name}\n${attachment.url}`,
        });
      }
    }
  } catch (err) {
    console.error('Discord → LINE error:', err);
  }
});

app.post(
  '/webhook',
  (req, res, next) => {
    getRawBody(
      req,
      {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: req.charset || 'utf-8',
      },
      (err, string) => {
        if (err) return next(err);
        req.rawBody = string;
        try {
          req.body = JSON.parse(string);
        } catch (e) {
          req.body = {};
        }
        next();
      }
    );
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
