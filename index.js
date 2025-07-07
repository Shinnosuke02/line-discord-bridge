const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const { Client: DiscordClient, GatewayIntentBits, WebhookClient, AttachmentBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

dotenv.config();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const lineClient = new Client(lineConfig);
const discordClient = new DiscordClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const app = express();
const port = process.env.PORT || 3000;

// --- rawBody取得（LINE署名検証用） ---
app.use((req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => data += chunk);
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

// --- LINE webhook受信 ---
app.post('/webhook', middleware(lineConfig), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message') {
      const channelId = await getOrCreateChannel(event);
      const channel = await discordClient.channels.fetch(channelId);

      // スタンプ（スタンプIDを画像URLに変換）
      if (event.message.type === 'sticker') {
        const stickerUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/IOS/sticker.png`;
        const embed = { image: { url: stickerUrl } };
        await channel.send({
          content: `${event.source.userId}:`,
          embeds: [embed]
        });
      }

      // 画像/ファイルメッセージ
      else if (event.message.type === 'image' || event.message.type === 'file') {
        const buffer = await downloadLineContent(event.message.id);
        const ext = event.message.type === 'image' ? '.jpg' : path.extname(event.message.fileName || '.bin');
        const filename = event.message.fileName || `file${ext}`;
        const attachment = new AttachmentBuilder(buffer, { name: filename });
        await channel.send({ files: [attachment] });
      }

      // テキスト
      else if (event.message.type === 'text') {
        const profile = await getLineUserProfile(event.source);
        await channel.send({
          content: `**${profile.displayName}**: ${event.message.text}`,
          avatarURL: profile.pictureUrl
        });
      }
    }
  }
  res.sendStatus(200);
});

// --- Discord → LINE ---
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelName = message.channel.name;
  if (!channelName.startsWith('line-')) return;

  const lineTargetId = channelName.replace('line-', '');

  const content = message.content || '';
  const attachments = message.attachments.map(a => a.url);
  const lines = [content, ...attachments].filter(Boolean);

  for (const line of lines) {
    await lineClient.pushMessage(lineTargetId, {
      type: 'text',
      text: line
    });
  }
});

// --- ユーザープロフィール取得 ---
async function getLineUserProfile(source) {
  if (source.type === 'user') {
    return await lineClient.getProfile(source.userId);
  }
  return { displayName: 'LINEユーザー', pictureUrl: '' };
}

// --- ファイルのダウンロード ---
async function downloadLineContent(messageId) {
  const stream = await lineClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// --- Discordチャンネル作成または取得 ---
async function getOrCreateChannel(event) {
  const guild = await discordClient.guilds.fetch(process.env.DISCORD_SERVER_ID);
  const nameBase = (await getLineUserProfile(event.source)).displayName || 'line';
  const channelName = `line-${nameBase.toLowerCase().replace(/\s+/g, '')}`;

  let existing = guild.channels.cache.find(c => c.name === channelName);
  if (!existing) {
    existing = await guild.channels.create({
      name: channelName,
      type: 0,
      reason: 'LINE連携用に自動作成'
    });
    await existing.send(`🔗 このチャンネルはLINEと接続されました。`);
  }
  return existing.id;
}

// --- Discord起動 ---
discordClient.once('ready', () => {
  console.log('✅ Discord bot ready');
});

// --- サーバ起動 ---
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

discordClient.login(process.env.DISCORD_BOT_TOKEN);
