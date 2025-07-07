require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const app = express();

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
const mappingPath = path.join('/tmp', 'mapping.json');
let mapping = {};
if (fs.existsSync(mappingPath)) {
  mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} else {
  fs.writeFileSync(mappingPath, JSON.stringify({}));
}

// ✅ 生のBodyを取得するミドルウェア（LINE用）
app.use('/webhook', express.raw({ type: '*/*' }));

// Webhook受信
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  console.log('📨 LINE Webhook received');
  const events = req.body.events;

  for (const event of events) {
    console.log('📦 Event:', JSON.stringify(event, null, 2));

    if (event.type !== 'message' || event.message.type !== 'text') {
      console.log('⚠️ スキップ対象イベント（非テキスト）');
      continue;
    }

    const sourceId = event.source.groupId || event.source.userId;
    let discordChannelId = mapping[sourceId];
    console.log(`🔍 sourceId: ${sourceId}`);
    console.log(`🔁 対応するDiscordチャンネルID: ${discordChannelId || '未登録'}`);

    try {
      if (!discordChannelId) {
        const guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID);
        console.log(`✅ Guild取得成功: ${guild.name}`);

        const channel = await guild.channels.create({
          name: `line-${sourceId.slice(0, 8)}`,
          type: 0, // GUILD_TEXT
        });
        console.log(`📘 チャンネル作成成功: ${channel.name}`);

        discordChannelId = channel.id;
        mapping[sourceId] = discordChannelId;
        fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
        await channel.send('🔗 このチャンネルはLINEと接続されました。');
      }

      const channel = await discordClient.channels.fetch(discordChannelId);
      await channel.send(`💬 LINE: ${event.message.text}`);
      console.log(`✅ メッセージ送信完了`);
    } catch (err) {
      console.error('❌ エラー:', err);
    }
  }

  res.status(200).send('OK');
});

// ✅ LINE用ルート以外に通常の JSON を使いたいときはここから適用
app.use(express.json());

// サーバ起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
