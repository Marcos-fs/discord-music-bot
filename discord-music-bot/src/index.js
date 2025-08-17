const { Client, GatewayIntentBits } = require("discord.js");
const { DisTube } = require("distube");
const { default: FFmpeg } = require("@distube/ffmpeg"); // plugin oficial

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Configuração do DisTube com plugin de FFmpeg
const distube = new DisTube(client, {
  plugins: [new FFmpeg()],
  emitNewSongOnly: true,
  leaveOnFinish: true,
  leaveOnEmpty: true
});

// Eventos básicos
client.once("ready", () => {
  console.log(`🤖 Bot logado como ${client.user.tag}`);
});

// Comandos simples
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const command = args.shift().toLowerCase();

  if (command === "!play") {
    const query = args.join(" ");
    if (!query) return message.reply("❌ Você precisa digitar o nome ou link da música.");
    if (!message.member.voice.channel) return message.reply("❌ Você precisa estar em um canal de voz.");

    try {
      await distube.play(message.member.voice.channel, query, {
        member: message.member,
        textChannel: message.channel,
        message
      });
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Ocorreu um erro ao tentar reproduzir a música.");
    }
  }

  if (command === "!stop") {
    const queue = distube.getQueue(message);
    if (!queue) return message.reply("❌ Não há nenhuma música tocando.");
    queue.stop();
    message.channel.send("🛑 Música parada.");
  }

  if (command === "!skip") {
    const queue = distube.getQueue(message);
    if (!queue) return message.reply("❌ Não há nenhuma música tocando.");
    queue.skip();
    message.channel.send("⏭️ Música pulada.");
  }
});

// Eventos do player
distube
  .on("playSong", (queue, song) =>
    queue.textChannel.send(`🎶 Tocando agora: \`${song.name}\``)
  )
  .on("addSong", (queue, song) =>
    queue.textChannel.send(`➕ Música adicionada: \`${song.name}\``)
  )
  .on("error", (channel, error) => {
    console.error(error);
    channel.send("⚠️ Ocorreu um erro no player.");
  });

// Login
client.login(process.env.TOKEN);
