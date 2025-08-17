// src/index.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Inicializando DisTube
const distube = new DisTube(client, {
    emitNewSongOnly: true,    // emite evento apenas para músicas novas
    leaveOnEmpty: true,       // desconecta se o canal ficar vazio
    leaveOnFinish: true,      // desconecta quando a playlist terminar
    youtubeDL: false,         // desativar youtube-dl nativo
    plugins: [new YtDlpPlugin()] // plugin yt-dlp
});

// Eventos do DisTube
distube.on('playSong', (queue, song) => {
    queue.textChannel.send(`🎵 Tocando: **${song.name}** - \`${song.formattedDuration}\``);
});

distube.on('addSong', (queue, song) => {
    queue.textChannel.send(`✅ Adicionado: **${song.name}** - \`${song.formattedDuration}\``);
});

distube.on('error', (channel, error) => {
    if (channel) channel.send(`❌ Ocorreu um erro: ${error}`);
    else console.error(error);
});

// Comandos via Discord (slash commands)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'play') {
        const query = options.getString('song');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply('Você precisa estar em um canal de voz!');
        }

        await interaction.deferReply();
        distube.play(voiceChannel, query, {
            textChannel: interaction.channel,
            member: interaction.member
        });
        interaction.editReply(`🔍 Procurando por: **${query}**`);
    }

    if (commandName === 'skip') {
        const queue = distube.getQueue(interaction.guildId);
        if (!queue) return interaction.reply('Não há músicas na fila!');
        queue.skip();
        interaction.reply('⏭ Música pulada!');
    }

    if (commandName === 'stop') {
        const queue = distube.getQueue(interaction.guildId);
        if (!queue) return interaction.reply('Não há músicas na fila!');
        queue.stop();
        interaction.reply('⏹ Música parada e fila limpa!');
    }
});

// Express: interface web simples para tocar músicas
app.post('/play', async (req, res) => {
    const { guildId, voiceChannelId, query } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Servidor não encontrado' });

    const voiceChannel = guild.channels.cache.get(voiceChannelId);
    if (!voiceChannel) return res.status(404).json({ error: 'Canal de voz não encontrado' });

    try {
        distube.play(voiceChannel, query);
        res.json({ success: true, message: `Procurando por: ${query}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start bot + web server
client.login(process.env.BOT_TOKEN);
app.listen(process.env.PORT || 3000, () => {
    console.log('Web server rodando...');
});
