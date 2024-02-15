import { ChainId, registry } from '@angleprotocol/sdk';

import ConsoleLogger from '../helpers/logger/ConsoleLogger';
import DiscordWebhookLogger from '../helpers/logger/DiscordWebhookLogger';
import Logger from '../helpers/logger/Logger';
import Loggers from '../helpers/logger/Loggers';
import OnChainProvider from '../providers/on-chain/OnChainProvider';
import RpcProvider from '../providers/on-chain/RpcProvider';

export interface DisputeContext {
  chainId: ChainId;
  onChainProvider: OnChainProvider;
  blockNumber?: number;
  logger?: Logger;
  uploadDiffTable?: boolean;
}

const NETWORKS: { [chainId: number]: string } = [];
for (const c of Object.keys(ChainId)) {
  try {
    NETWORKS[c] = process.env[`PROVIDER_${c}`];
  } catch {}
}

export const defaultContext = (chainId: number, blockNumber?: number): DisputeContext => {
  const merklRegistry = registry(chainId).Merkl;
  const loggers = [new ConsoleLogger()];
  const discordAvailable = !!process.env['DISCORD_TOKEN'];
  const onChainProvider = new RpcProvider(NETWORKS[chainId], merklRegistry.Distributor, merklRegistry.DistributionCreator);

  blockNumber && onChainProvider.setBlock(blockNumber);

  if (discordAvailable) loggers.push(new DiscordWebhookLogger());

  return {
    chainId,
    blockNumber,
    onChainProvider,
    logger: new Loggers(loggers),
    uploadDiffTable: true,
  };
};
