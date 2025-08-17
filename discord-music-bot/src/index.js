require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, StreamType } = require('@discordjs/voice');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const ytdl = require('ytdl-core');
const YouTube = require('youtube-sr').default;

// Configuração do Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configuração do Discord Bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Sistema de música
class MusicBot {
  constructor() {
    this.queue = new Map();
    this.connections = new Map();
    this.players = new Map();
  }

  async play(guildId, song) {
    const serverQueue = this.queue.get(guildId);
    if (!serverQueue) return;

    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    try {
      // Usar ytdl-core com opções otimizadas
      const stream = ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25
      });

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });

      player.play(resource);
      connection.subscribe(player);

      const embed = new EmbedBuilder()
        .setTitle('🎵 Tocando Agora')
        .setDescription(`**${song.title}**`)
        .setThumbnail(song.thumbnail)
        .setColor('#FF6B6B')
        .addFields(
          { name: 'Duração', value: song.duration, inline: true },
          { name: 'Solicitado por', value: song.requestedBy, inline: true }
        );

      serverQueue.textChannel.send({ embeds: [embed] });
      
      // Emitir para o site
      io.emit('nowPlaying', {
        guildId,
        song: song,
        queue: serverQueue.songs
      });

    } catch (error) {
      console.error('Erro ao reproduzir:', error);
      serverQueue.textChannel.send('❌ Erro ao reproduzir a música! Tentando próxima...');
      this.skip(guildId);
    }
  }

  async addToQueue(guildId, song, textChannel, voiceChannel) {
    let serverQueue = this.queue.get(guildId);

    if (!serverQueue) {
      const queueContruct = {
        textChannel: textChannel,
        voiceChannel: voiceChannel,
        songs: [],
        playing: false
      };

      this.queue.set(guildId, queueContruct);
      serverQueue = queueContruct;

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        
        this.connections.set(guildId, connection);
        this.players.set(guildId, player);

        connection.on(VoiceConnectionStatus.Ready, () => {
          console.log(`Conectado ao canal de voz no servidor: ${voiceChannel.guild.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
          console.log('Desconectado do canal de voz');
          this.stop(guildId);
        });

        player.on(AudioPlayerStatus.Idle, () => {
          serverQueue.songs.shift();
          if (serverQueue.songs.length > 0) {
            this.play(guildId, serverQueue.songs[0]);
          } else {
            this.stop(guildId);
          }
        });

        player.on('error', error => {
          console.error('Erro no player:', error);
          this.skip(guildId);
        });

      } catch (error) {
        console.error('Erro ao conectar:', error);
        this.queue.delete(guildId);
        return textChannel.send('❌ Não consegui conectar ao canal de voz!');
      }
    }

    serverQueue.songs.push(song);

    if (serverQueue.songs.length === 1) {
      this.play(guildId, song);
      serverQueue.playing = true;
    } else {
      const embed = new EmbedBuilder()
        .setTitle('✅ Adicionado à fila')
        .setDescription(`**${song.title}**\nPosição na fila: ${serverQueue.songs.length}`)
        .setThumbnail(song.thumbnail)
        .setColor('#4ECDC4');

      textChannel.send({ embeds: [embed] });
    }

    // Atualizar o site
    io.emit('queueUpdate', {
      guildId,
      queue: serverQueue.songs,
      nowPlaying: serverQueue.songs[0]
    });
  }

  skip(guildId) {
    const serverQueue = this.queue.get(guildId);
    if (!serverQueue) return;

    const player = this.players.get(guildId);
    if (player) {
      player.stop();
    }
  }

  stop(guildId) {
    const serverQueue = this.queue.get(guildId);
    if (!serverQueue) return;

    serverQueue.songs = [];
    serverQueue.playing = false;

    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    if (player) player.stop();
    if (connection) connection.destroy();

    this.queue.delete(guildId);
    this.connections.delete(guildId);
    this.players.delete(guildId);

    io.emit('stopped', { guildId });
  }

  getQueue(guildId) {
    return this.queue.get(guildId);
  }
}

const musicBot = new MusicBot();

// Função para formatar duração
function formatDuration(duration) {
  if (!duration) return 'N/A';
  
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return duration;
  
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Comandos do Discord
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'play' || command === 'p') {
    if (!message.member.voice.channel) {
      return message.reply('❌ Você precisa estar em um canal de voz!');
    }

    if (!args.length) {
      return message.reply('❌ Por favor, forneça o nome da música ou URL!');
    }

    const query = args.join(' ');
    const loadingMsg = await message.channel.send('🔍 Procurando música...');

    try {
      let song;
      
      if (ytdl.validateURL(query)) {
        // URL direta do YouTube
        const info = await ytdl.getInfo(query);
        song = {
          title: info.videoDetails.title,
          url: query,
          thumbnail: info.videoDetails.thumbnails[0]?.url || '',
          duration: formatDuration(info.videoDetails.lengthSeconds ? `PT${info.videoDetails.lengthSeconds}S` : ''),
          requestedBy: message.author.username
        };
      } else {
        // Buscar no YouTube
        const results = await YouTube.search(query, { limit: 1 });
        if (!results.length) {
          await loadingMsg.edit('❌ Nenhuma música encontrada!');
          return;
        }

        const video = results[0];
        song = {
          title: video.title,
          url: video.url,
          thumbnail: video.thumbnail?.displayThumbnailURL('maxresdefault') || video.thumbnail?.url || '',
          duration: video.durationFormatted || 'N/A',
          requestedBy: message.author.username
        };
      }

      await loadingMsg.delete();
      musicBot.addToQueue(message.guild.id, song, message.channel, message.member.voice.channel);

    } catch (error) {
      console.error('Erro na busca:', error);
      await loadingMsg.edit('❌ Erro ao buscar a música!');
    }
  }

  if (command === 'skip' || command === 's') {
    if (!message.member.voice.channel) {
      return message.reply('❌ Você precisa estar em um canal de voz!');
    }
    
    musicBot.skip(message.guild.id);
    message.reply('⏭️ Música pulada!');
  }

  if (command === 'stop') {
    if (!message.member.voice.channel) {
      return message.reply('❌ Você precisa estar em um canal de voz!');
    }
    
    musicBot.stop(message.guild.id);
    message.reply('⏹️ Música parada e bot desconectado!');
  }

  if (command === 'queue' || command === 'q') {
    const serverQueue = musicBot.getQueue(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) {
      return message.reply('❌ A fila está vazia!');
    }

    const embed = new EmbedBuilder()
      .setTitle('🎵 Fila de Músicas')
      .setColor('#FFD93D');

    let description = '';
    serverQueue.songs.slice(0, 10).forEach((song, index) => {
      description += `${index === 0 ? '▶️' : `${index}.`} **${song.title}** - ${song.duration}\n`;
    });

    if (serverQueue.songs.length > 10) {
      description += `\n... e mais ${serverQueue.songs.length - 10} músicas`;
    }

    embed.setDescription(description);
    message.channel.send({ embeds: [embed] });
  }
});

// API Routes
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const results = await YouTube.search(query, { limit: 10 });
    
    const songs = results.map(video => ({
      title: video.title,
      url: video.url,
      thumbnail: video.thumbnail?.displayThumbnailURL('maxresdefault') || video.thumbnail?.url || '',
      duration: video.durationFormatted || 'N/A',
      channel: video.channel?.name || 'Desconhecido',
      views: video.views || 0
    }));

    res.json(songs);
  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ error: 'Erro ao buscar músicas' });
  }
});

app.post('/api/play', async (req, res) => {
  try {
    const { guildId, songUrl, channelId } = req.body;
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(400).json({ error: 'Servidor não encontrado' });
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      return res.status(400).json({ error: 'Canal de voz não encontrado' });
    }

    let song;
    
    if (ytdl.validateURL(songUrl)) {
      const info = await ytdl.getInfo(songUrl);
      song = {
        title: info.videoDetails.title,
        url: songUrl,
        thumbnail: info.videoDetails.thumbnails[0]?.url || '',
        duration: formatDuration(info.videoDetails.lengthSeconds ? `PT${info.videoDetails.lengthSeconds}S` : ''),
        requestedBy: 'Website'
      };
    } else {
      return res.status(400).json({ error: 'URL inválida' });
    }

    const textChannel = guild.channels.cache.find(ch => 
      ch.name.includes('geral') || 
      ch.name.includes('music') || 
      ch.type === 0
    ) || guild.systemChannel;
    
    musicBot.addToQueue(guildId, song, textChannel || channel, channel);
    
    res.json({ success: true, song });
  } catch (error) {
    console.error('Erro ao tocar música:', error);
    res.status(500).json({ error: 'Erro ao tocar música' });
  }
});

app.get('/api/queue/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  const serverQueue = musicBot.getQueue(guildId);
  
  if (!serverQueue) {
    return res.json({ queue: [], nowPlaying: null });
  }
  
  res.json({
    queue: serverQueue.songs,
    nowPlaying: serverQueue.songs[0] || null,
    playing: serverQueue.playing
  });
});

app.post('/api/skip/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  musicBot.skip(guildId);
  res.json({ success: true });
});

app.post('/api/stop/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  musicBot.stop(guildId);
  res.json({ success: true });
});

app.get('/api/guilds', (req, res) => {
  const guilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    voiceChannels: guild.channels.cache
      .filter(channel => channel.type === 2)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        members: channel.members.size
      }))
  }));
  
  res.json(guilds);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Online',
    bot: client.user ? client.user.tag : 'Offline',
    servers: client.guilds.cache.size,
    uptime: process.uptime()
  });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Bot Events
client.once('ready', () => {
  console.log(`🤖 Bot online como ${client.user.tag}!`);
  console.log(`📊 Conectado a ${client.guilds.cache.size} servidor(es)`);
  console.log(`🌐 Servidor web rodando na porta ${process.env.PORT || 3000}`);
  
  // Set bot status
  client.user.setActivity('🎵 Música | !play', { type: 'LISTENING' });
});

client.on('error', console.error);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Encerrando bot...');
  client.destroy();
  server.close();
  process.exit(0);
});

// Inicialização
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);:', error);
    res.status(500).json({ error: 'Erro ao tocar música' });
  }
});

app.get('/api/queue/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  const serverQueue = musicBot.getQueue(guildId);
  
  if (!serverQueue) {
    return res.json({ queue: [], nowPlaying: null });
  }
  
  res.json({
    queue: serverQueue.songs,
    nowPlaying: serverQueue.songs[0] || null,
    playing: serverQueue.playing
  });
});

app.post('/api/skip/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  musicBot.skip(guildId);
  res.json({ success: true });
});

app.post('/api/stop/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  musicBot.stop(guildId);
  res.json({ success: true });
});

app.get('/api/guilds', (req, res) => {
  const guilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    voiceChannels: guild.channels.cache
      .filter(channel => channel.type === 2)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        members: channel.members.size
      }))
  }));
  
  res.json(guilds);
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Bot Events
client.once('ready', () => {
  console.log(`🤖 Bot online como ${client.user.tag}!`);
  console.log(`🌐 Servidor web rodando na porta ${process.env.PORT || 3000}`);
});

client.on('error', console.error);

// Inicialização
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
