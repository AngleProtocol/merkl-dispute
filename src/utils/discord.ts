import { APIEmbedField, Client, EmbedBuilder, GatewayIntentBits, Partials, TextChannel } from 'discord.js';

import { getEnv } from '.';
import { log } from './merkl';

const colorBySeverity = {
  info: 0x00bfff,
  warning: 0xffa500,
  error: 0xff0000,
};

const getChannel = (discordClient: Client<boolean>, channelName: string) => {
  return (discordClient.channels.cache as unknown as TextChannel[]).find((channel) => channel.name === channelName);
};

export async function sendSummary(title: string, success: boolean, description: string, fields: APIEmbedField[], key = '') {
  const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  discordClient.login(process.env.DISCORD_TOKEN);

  const env = process.env.ENV;

  let channel: TextChannel;

  discordClient.on('ready', () => {
    channel = getChannel(discordClient, success || env !== 'prod' ? 'dispute-bot-logs' : 'dispute-bot');
    if (!channel) {
      log(key, 'Discord channel not found');
      return;
    }
    const exampleEmbed = new EmbedBuilder()
      .setColor(colorBySeverity[success ? 'info' : 'error'])
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setTimestamp();

    channel.send({ embeds: [exampleEmbed] });
  });
}
