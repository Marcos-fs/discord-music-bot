const { Client, GatewayIntentBits } = require("discord.js");
const { DisTube } = require("distube");
const { default: FFmpeg } = require("@distube/ffmpeg");
const ffmpegPath = require("ffmpeg-static"); // 👈 pega o caminho correto do binário

// Puxa o plugin de ffmpeg já com o caminho do binário
class CustomFFmpeg extends FFmpeg {
  constructor() {
    super();
    this.ffmpeg = ffmpegPath; // 👈 força usar o ffmpeg-static
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const distube = new DisTube(client, {
  plugins: [new CustomFFmpeg()],
  emitNewSongOnly: true,
  leaveOnFinish: true,
  leaveOnEmpty: true
});

client.once("ready", () => {
  console.log(`🤖 Bot logado como ${client.user.tag}`);
});

// --- seus comandos aqui ---

client.login(process.env.TOKEN);
