require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const line = require('@line/bot-sdk');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// LINE設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new line.Client(lineConfig);

// Discord設定
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
discordClient.login(process.env.DISCORD_BOT_TOKEN);

// Mappingファイル
const mappingPath = './mapping.json';
let mapping = {};
if (fs.existsSync(mappingPath)) {
  mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} else {
  fs.writeFileSync(mappingPath, JSON.stringify({}));
}

// LINE Webhook
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const sourceId = event.source.groupId || event.source.userId;
    let discordChannelId = mapping[sourceId];

    if (!discordChannelId) {
      const guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID);
      const channelName = event.source.groupId
        ? `group-${sourceId.slice(0, 8)}`
        : `user-${sourceId.slice(0, 8)}`;
      const channel = await guild.channels.create({
        name: channelName,
        type: 0,
      });
      discordChannelId = channel.id;
      mapping[sourceId] = discordChannelId;
      fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
      await channel.send('🔗 LINEと接続されました。');
    }

    const profile = await lineClient.getProfile(event.source.userId);
    const channel = await discordClient.channels.fetch(discordChannelId);
    const webhook = await channel.createWebhook({ name: profile.displayName });

    await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: profile.displayName,
        avatar_url: profile.pictureUrl,
        content: event.message.text,
      }),
    });
  }
  res.status(200).send('OK');
});

// Discord → LINE
discordClient.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  const entry = Object.entries(mapping).find(([, v]) => v === msg.channelId);
  if (!entry) return;

  const lineGroupId = entry[0];
  await lineClient.pushMessage(lineGroupId, {
    type: 'text',
    text: msg.content,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
