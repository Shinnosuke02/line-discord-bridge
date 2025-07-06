require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const line = require('@line/bot-sdk');
const fs = require('fs');

const app = express();
app.use(express.json());

// LINE config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new line.Client(lineConfig);

// Discord bot init
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
discordClient.login(process.env.DISCORD_BOT_TOKEN);

// Load or create mapping file
const mappingPath = './mapping.json';
let mapping = {};
if (fs.existsSync(mappingPath)) {
  mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} else {
  fs.writeFileSync(mappingPath, JSON.stringify({}));
}

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    const sourceId = event.source.groupId || event.source.userId;
    let discordChannelId = mapping[sourceId];

    if (!discordChannelId) {
      // Create a new Discord channel
      const guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID);
      const channel = await guild.channels.create({
        name: `line-${sourceId.slice(0, 8)}`,
        type: 0, // GUILD_TEXT
      });
      discordChannelId = channel.id;
      mapping[sourceId] = discordChannelId;
      fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
      await channel.send('🔗 このチャンネルはLINEと接続されました。');
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const msg = event.message.text;
      const channel = await discordClient.channels.fetch(discordChannelId);
      await channel.send(`💬 LINE: ${msg}`);
    }
  }

  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
