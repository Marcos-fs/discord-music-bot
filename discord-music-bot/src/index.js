require('dotenv').config(); // lê variáveis do .env / ambiente

const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const distube = new DisTube(client, {

});

// Eventos básicos
client.once('ready', () => {
  console.log(`Bot iniciado como ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'play') {
    const url = args[0];
    if (!url) return message.reply('Envie uma URL ou nome de música!');
    distube.play(message.member.voice.channel, url, { textChannel: message.channel, member: message.member });
  }
});

client.login(process.env.DISCORD_TOKEN);
