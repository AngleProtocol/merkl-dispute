import { APIEmbedField, Client, EmbedBuilder, GatewayIntentBits, Partials, TextChannel } from 'discord.js';

import { log } from './merkl';

const colorBySeverity = {
  info: 0x00bfff,
  warning: 0xffa500,
  error: 0xff0000,
};
type severity = 'info' | 'warning' | 'error';

const getChannel = (discordClient: Client<boolean>, channelName: string) => {
  return (discordClient.channels.cache as unknown as TextChannel[]).find((channel) => channel.name === channelName);
};

export async function sendDiscordNotification(params: {
  title: string;
  description: string;
  fields: APIEmbedField[];
  isAlert: boolean;
  severity: severity;
  key: string;
}) {
  try {
    const discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel],
    });

    discordClient.login(process.env.DISCORD_TOKEN);

    const env = process.env.ENV;

    let channel: TextChannel;

    discordClient.on('ready', () => {
      channel = getChannel(discordClient, !params.isAlert || env !== 'prod' ? 'dispute-bot-logs' : 'dispute-bot');
      if (!channel) {
        log(params.key, '❌ discord channel not found');
        return;
      }
      const exampleEmbed = new EmbedBuilder()
        .setColor(colorBySeverity[params.severity])
        .setTitle(params.title)
        .setDescription(params.description)
        .addFields(params.fields)
        .setTimestamp();

      channel.send({ embeds: [exampleEmbed] });
    });
  } catch (e) {
    log('merkl dispute bot', `❌ couldn't send summary to discord with reason: \n ${e}`);
  }
}
