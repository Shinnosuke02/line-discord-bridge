require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { middleware, Client: LineClient } = require('@line/bot-sdk');
const fs = require('fs');
const getRawBody = require('raw-body');

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

async function getOrCreateChannel(displayName, userId) {
  const guild = discordClient.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  if (!guild) throw new Error('Guild not found. Check DISCORD_GUILD_ID and bot permissions.');

  const baseName = (displayName || userId).replace(/[\s\r\n]/g, '-').slice(0, 85);
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
  const isGroup = !!event.source.groupId;

  try {
    let displayName = sourceId;
    if (isGroup) {
      try {
        const groupSummary = await lineClient.getGroupSummary(sourceId);
        displayName = groupSummary.groupName || sourceId;
      } catch (e) {
        displayName = 'group-' + sourceId.slice(0, 8);
      }
    } else {
      const profile = await lineClient.getProfile(sourceId);
      displayName = profile.displayName;
    }

    const channelId = await getOrCreateChannel(displayName, sourceId);
    const channel = await discordClient.channels.fetch(channelId);

    if (event.message.type === 'text') {
      await channel.send(`**${displayName}**: ${event.message.text}`);
    } else if (event.message.type === 'image') {
      await channel.send(`📷 **${displayName}** sent an image.`);
    } else if (event.message.type === 'sticker') {
      await channel.send(`🎴 **${displayName}** sent a sticker.`);
    } else {
      await channel.send(`📎 **${displayName}** sent a ${event.message.type} message.`);
    }
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
