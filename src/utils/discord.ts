import { APIEmbedField, Client, EmbedBuilder, GatewayIntentBits, Partials, TextChannel } from 'discord.js';

import { getEnv } from '.';
import { log } from './merkl';

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

const getChannel = (channelName: string) => {
  return (discordClient.channels.cache as unknown as TextChannel[]).find((channel) => channel.name === channelName);
};

discordClient.login(process.env.DISCORD_TOKEN as string);

export async function sendMessage(text: string) {
  const channel = getChannel('merkl-logs');
  if (!channel) {
    console.log("couldn't find channel");
    throw new Error("couldn't find channel");
  }
  await channel.send(text);
}

export const DiscordSpace = {
  name: '\u200b',
  value: '\u200b',
  inline: false,
};

export async function sendSummary(title: string, success: boolean, description: string, fields: APIEmbedField[], key = '') {
  const env = getEnv();
  const channel = getChannel(success || env !== 'prod' ? 'dispute-bot-logs' : 'dispute-bot');
  if (!channel) {
    log(key, "❌ couldn't find channel");
    return;
  }
  const successIcon = '✅';
  const failureIcon = '❌';
  fields = fields.map((f) => {
    return { ...f, value: f.value.replace('success', successIcon).replace('failure', failureIcon), inline: f.inline ?? true };
  });
  const exampleEmbed = new EmbedBuilder()
    .setColor(success ? 0x2ac8a5 : 0xda2f61)
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setTimestamp();

  await channel.send({ embeds: [exampleEmbed] });
}
