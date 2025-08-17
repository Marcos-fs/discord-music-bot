require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const express = require('express');
const cors = require('cors');

// --- Discord Client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// --- DisTube Setup ---
const distube = new DisTube(client, {
    emitNewSongOnly: true,
    plugins: [new YtDlpPlugin()]
});

// --- Express Web Server ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint simples para pesquisar/play músicas via web
app.post('/play', async (req, res) => {
    const { guildId, channelId, query } = req.body;
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const voiceChannel = guild.channels.cache.get(channelId);
        if (!voiceChannel || voiceChannel.type !== 2) // 2 = GUILD_VOICE
            return res.status(404).json({ error: 'Voice channel not found' });

        const queue = await distube.play(voiceChannel, query, {
            textChannel: guild.channels.cache.find(c => c.isTextBased()),
            member: guild.members.cache.get(client.user.id)
        });

        res.json({ message: `Playing: ${queue.songs[0].name}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Could not play the song' });
    }
});

// --- Start Express ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// --- Discord Events ---
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('error', console.error);

// --- Optional: log when songs start ---
distube.on('playSong', (queue, song) => {
    const textChannel = queue.textChannel;
    if (textChannel) textChannel.send(`🎵 Now playing: ${song.name}`);
});

// --- Login ---
client.login(process.env.DISCORD_TOKEN);
