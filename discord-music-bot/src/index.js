require('dotenv').config(); // para uso local; no Railway use Variables

const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Importante: não inclua leaveOnStop/leaveOnEmpty/leaveOnFinish (removidas em versões recentes)
const distube = new DisTube(client, {
  plugins: [new YtDlpPlugin({ update: false })] // em produção, melhor não atualizar a cada start
});

// Eventos básicos
client.once('ready', () => {
  console.log(`Bot iniciado como ${client.user.tag}`);
});

// Eventos úteis do DisTube (debug e feedback)
distube
  .on('playSong', (queue, song) => {
    queue.textChannel?.send(`▶️ Tocando: ${song.name} (${song.formattedDuration})`).catch(() => {});
  })
  .on('error', (channel, error) => {
    console.error('DisTube error:', error);
    channel?.send('Ocorreu um erro ao reproduzir áudio.').catch(() => {});
  });

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === 'play') {
    const query = args.join(' ');
    if (!query) return message.reply('Envie uma URL ou nome de música!');

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('Você precisa estar em um canal de voz.');
    }

    try {
      await distube.play(voiceChannel, query, {
        member: message.member,
        textChannel: message.channel
        // message // descomente se sua versão exigir o objeto message
      });
    } catch (err) {
      console.error('Erro no play:', err);
      message.reply('Não consegui iniciar a reprodução.').catch(() => {});
    }
  }

  if (command === 'stop') {
    try {
      const queue = distube.getQueue(message.guildId);
      if (!queue) return message.reply('Nada está tocando.');
      await queue.stop();
      message.channel.send('⏹️ Parado.');
    } catch (err) {
      console.error('Erro no stop:', err);
      message.reply('Não consegui parar a reprodução.').catch(() => {});
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN não definido nas variáveis de ambiente.');
  process.exit(1);
}
client.login(token);
