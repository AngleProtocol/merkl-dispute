import { ChainId } from '@angleprotocol/sdk';
import { APIEmbedField, Client, EmbedBuilder, GatewayIntentBits, Partials, TextChannel } from 'discord.js';

import { getBotName, getEnv } from '.';

const colorBySeverity = {
  info: 0x00bfff,
  success: 0x00dd55,
  warning: 0xffa500,
  error: 0xff0000,
};
export type severity = 'info' | 'warning' | 'error' | 'success';

const chainFooter = {
  137: { text: 'Polygon', iconURL: 'https://cdn.jsdelivr.net/gh/webThreeBuilder/CryptoLogos/logos/matic.png' },
  1: { text: 'Ethereum', iconURL: 'https://cdn.jsdelivr.net/gh/webThreeBuilder/CryptoLogos/logos/eth.png' },
  10: { text: 'Optimism', iconURL: 'https://cdn.jsdelivr.net/gh/webThreeBuilder/CryptoLogos/logos/10.png' },
  42161: { text: 'Arbitrum', iconURL: 'https://cdn.jsdelivr.net/gh/webThreeBuilder/CryptoLogos/logos/42161.png' },
  1101: { text: 'Polygon zvEVM', iconURL: 'https://cdn.jsdelivr.net/gh/webThreeBuilder/CryptoLogos/logos/matic.png' },
  8453: { text: 'Base', iconURL: 'https://icons.llamao.fi/icons/chains/rsz_base.jpg' },
};

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
  chain?: ChainId;
}) {
  return new Promise(async function (resolve, reject) {
    try {
      const discordClient = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
        partials: [Partials.Channel],
      });

      discordClient.login(process.env.DISCORD_TOKEN);

      const env = process.env.ENV;
      const logChannel = process.env.DISCORD_LOG_CHANNEL ?? 'dispute-bot-logs';
      const alertChannel = process.env.DISCORD_LOG_CHANNEL ?? 'dispute-bot';

      let channel: TextChannel;

      discordClient.on('ready', async () => {
        channel = getChannel(discordClient, !params.isAlert || env !== 'prod' ? logChannel : alertChannel);
        if (!channel) {
          console.log(params.key, '❌ discord channel not found');
          return;
        }

        if (!!params.description) {
          try {
            params.description = params?.description?.slice(0, 1000);
          } catch {}
        }
        const exampleEmbed = new EmbedBuilder()
          .setAuthor({
            name: `Merkle Dispute Bot ${getEnv() !== 'prod' ? '[DEV]' : !!getBotName() ?? ''}`,
            iconURL: 'https://merkl.angle.money/images/merkl-apple-touch-icon.png',
            url: 'https://github.com/AngleProtocol/merkl-dispute',
          })
          .setColor(colorBySeverity[params.severity])
          .setTitle(`${params.title}`)
          .setDescription(params.description ?? 'nodesc')
          .addFields(params.fields)
          .setFooter(chainFooter[params.chain] ?? { text: `${params.chain}` });

        await channel.send({ embeds: [exampleEmbed] });

        discordClient.destroy();
        resolve({});
      });
      resolve({});
    } catch (e) {
      console.log('merkl dispute bot', `❌ couldn't send summary to discord with reason: \n ${e}`);
      reject();
    }
  });
}
