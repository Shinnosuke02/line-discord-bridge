require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { middleware, Client: LineClient } = require('@line/bot-sdk');
const fs = require('fs');

const app = express();
app.use(express.json());

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

const channelCache = new Map();
const userChannelMapPath = './userChannelMap.json';
let userChannelMap = {};
if (fs.existsSync(userChannelMapPath)) {
  userChannelMap = JSON.parse(fs.readFileSync(userChannelMapPath, 'utf-8'));
}

async function getOrCreateChannel(displayName, userId) {
  if (userChannelMap[userId]) return userChannelMap[userId];

  const guild = await discordClient.guilds.fetch(process.env.DISCORD_SERVER_ID);
  const baseName = displayName.toLowerCase().replace(/[^a-z0-9\-]/g, '-').slice(0, 20);
  const channelName = `line-${baseName}`;

  const existing = guild.channels.cache.find(
    (c) => c.name === channelName && c.type === 0
  );
  if (existing) {
    userChannelMap[userId] = existing.id;
    fs.writeFileSync(userChannelMapPath, JSON.stringify(userChannelMap, null, 2));
    return existing.id;
  }

  const newChannel = await guild.channels.create({
    name: channelName,
    type: 0,
    reason: 'LINE user sync',
  });

  userChannelMap[userId] = newChannel.id;
  fs.writeFileSync(userChannelMapPath, JSON.stringify(userChannelMap, null, 2));
  return newChannel.id;
}

async function handleEvent(event) {
  if (event.type !== 'message') return;
  const sourceId = event.source.groupId || event.source.userId;
  const isGroup = !!event.source.groupId;

  try {
    let displayName = sourceId;
    if (!isGroup) {
      const profile = await lineClient.getProfile(sourceId);
      displayName = profile.displayName;
    }

    const channelId = await getOrCreateChannel(displayName, sourceId);
    const channel = await discordClient.channels.fetch(channelId);

    if (event.message.type === 'text') {
      await channel.send(`**${displayName}**: ${event.message.text}`);
    } else if (event.message.type === 'image') {
      await channel.send(`📷 ${displayName} sent an image (not shown here).`);
    } else if (event.message.type === 'sticker') {
      await channel.send(`🎴 ${displayName} sent a sticker.`);
    } else {
      await channel.send(`📎 ${displayName} sent a ${event.message.type} message.`);
    }
  } catch (err) {
    console.error('LINE → Discord error:', err);
  }
}

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const match = message.channel.name.match(/^line-([a-z0-9\-]+)/);
  if (!match) return;

  const userId = Object.keys(userChannelMap).find((key) => userChannelMap[key] === message.channel.id);
  if (!userId) {
    console.warn('No LINE user mapped to this channel');
    return;
  }

  try {
    const text = `${message.content}`;
    await lineClient.pushMessage(userId, { type: 'text', text });
  } catch (err) {
    console.error('Discord → LINE error:', err);
  }
});

app.post('/webhook', middleware(lineConfig), async (req, res) => {
  try {
    for (const event of req.body.events) {
      await handleEvent(event);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('NG');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
