
// @ts-check
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Client, GatewayIntentBits, Partials, Collection, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

// -------- Discord Client --------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel]
});

// -------- Music (DisTube) --------
const distube = new DisTube(client, {
  plugins: [new YtDlpPlugin()],
  emitNewSongOnly: false,
  leaveOnStop: true,
  leaveOnFinish: true,
});

client.commands = new Collection();

const commands = [
  {
    name: 'play',
    description: 'Toca música no seu canal de voz',
    options: [{ name: 'query', type: 3, description: 'Nome ou URL da música', required: true }]
  },
  { name: 'skip', description: 'Pula a música atual' },
  { name: 'stop', description: 'Para e limpa a fila' },
  { name: 'queue', description: 'Mostra a fila atual' },
  { name: 'help', description: 'Lista comandos disponíveis' }
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Slash commands registrados globalmente');
  } catch (err) { console.error(err); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const { commandName, options, member } = interaction;

  try {
    if (commandName === 'help') {
      await interaction.reply(`Comandos disponíveis:\n/play [query]\n/skip\n/stop\n/queue`);
      return;
    }

    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel && commandName === 'play') {
      await interaction.reply({ content: 'Você precisa estar em um canal de voz!', ephemeral: true });
      return;
    }

    switch (commandName) {
      case 'play':
        const query = options.getString('query');
        await distube.play(voiceChannel, query, { textChannel: interaction.channel });
        await interaction.reply({ content: `🎵 Tocando: ${query}`, ephemeral: true });
        break;
      case 'skip':
        const queueSkip = distube.getQueue(interaction.guildId);
        if (!queueSkip) return interaction.reply({ content: 'Fila vazia', ephemeral: true });
        queueSkip.skip();
        await interaction.reply({ content: '⏭️ Música pulada', ephemeral: true });
        break;
      case 'stop':
        const queueStop = distube.getQueue(interaction.guildId);
        if (!queueStop) return interaction.reply({ content: 'Fila vazia', ephemeral: true });
        queueStop.stop();
        await interaction.reply({ content: '⏹️ Fila parada', ephemeral: true });
        break;
      case 'queue':
        const queueList = distube.getQueue(interaction.guildId);
        if (!queueList || !queueList.songs.length) return interaction.reply({ content: 'Fila vazia', ephemeral: true });
        const list = queueList.songs.map((s, i) => `#${i+1} - ${s.name} (${s.formattedDuration})`).join('\n');
        await interaction.reply({ content: `🎶 Fila:\n${list}`, ephemeral: true });
        break;
    }
  } catch (err) {
    console.error('Erro na interação:', err);
    interaction.reply({ content: '❌ Ocorreu um erro', ephemeral: true });
  }
});

distube
  .on('playSong', (queue, song) => console.log(`▶️ Playing: ${song.name} (${song.url})`))
  .on('addSong', (queue, song) => console.log(`➕ Added: ${song.name}`))
  .on('error', (channel, err) => console.error('❌ DisTube error:', err));

// -------- Web Server --------
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'missing query ?q=' });
  try {
    const results = await distube.search(q, { limit: 8, type: 'video', safeSearch: false });
    const mapped = results.map(r => ({
      name: r.name,
      url: r.url,
      thumbnail: r.thumbnail,
      duration: r.duration,
      uploader: r.uploader?.name || null
    }));
    res.json({ results: mapped });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'search_failed' });
  }
});

app.get('/api/queue', (_req, res) => {
  const allQueues = Array.from(distube.queues.values());
  if (!allQueues.length) return res.json({ songs: [] });
  const queue = allQueues[0];
  res.json({
    playing: queue.songs[0]?.name || null,
    songs: queue.songs.map((s, i) => ({
      index: i,
      name: s.name,
      url: s.url,
      duration: s.formattedDuration || s.duration,
      thumbnail: s.thumbnail
    }))
  });
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

(async () => {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web interface http://0.0.0.0:${PORT}`));
  } catch (e) { console.error('Startup error:', e); process.exit(1); }
})();
