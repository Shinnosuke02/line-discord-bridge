require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const line = require('@line/bot-sdk');
const fs = require('fs');

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

// LINE設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new line.Client(lineConfig);

// Discord設定
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
discordClient.login(process.env.DISCORD_BOT_TOKEN);

// Mappingファイル読み込み
const mappingPath = './mapping.json';
let mapping = {};
if (fs.existsSync(mappingPath)) {
  mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} else {
  fs.writeFileSync(mappingPath, JSON.stringify({}));
}

// 無効文字を除外する関数
function sanitizeName(name) {
  return name.toLowerCase().replace(/[^\w\-]/g, '-').slice(0, 90);
}

// LINE → Discord
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const sourceId = event.source.groupId || event.source.userId;
    let discordChannelId = mapping[sourceId];

    try {
      if (!discordChannelId) {
        // 名前取得
        let rawName = 'line-chat';
        if (event.source.type === 'user') {
          const profile = await lineClient.getProfile(event.source.userId);
          rawName = profile.displayName || 'user';
        } else if (event.source.type === 'group') {
          const summary = await lineClient.getGroupSummary(event.source.groupId);
          rawName = summary.groupName || 'group';
        }

        const channelName = sanitizeName(`line-${rawName}`);

        // Discordチャンネル作成
        const guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const channel = await guild.channels.create({
          name: channelName,
          type: 0,
        });

        discordChannelId = channel.id;
        mapping[sourceId] = discordChannelId;
        fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
        await channel.send('🔗 このチャンネルはLINEと接続されました。');
      }

      const channel = await discordClient.channels.fetch(discordChannelId);
      await channel.send(`💬 LINE: ${event.message.text}`);
    } catch (err) {
      console.error('❌ LINE → Discord エラー:', err);
    }
  }

  res.status(200).send('OK');
});

// Discord → LINE
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const lineSourceId = Object.keys(mapping).find(key => mapping[key] === message.channel.id);
  if (!lineSourceId) return;

  const displayName = message.member?.nickname || message.author.username;
  const content = message.content;

  try {
    await lineClient.pushMessage(lineSourceId, {
      type: 'text',
      text: `👤 ${displayName}: ${content}`
    });
  } catch (err) {
    console.error('❌ Discord → LINE エラー:', err);
  }
});

// サーバ起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
