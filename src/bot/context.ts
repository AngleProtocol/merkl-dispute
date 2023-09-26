import { ChainId, registry } from '@angleprotocol/sdk';

import ConsoleLogger from '../helpers/logger/ConsoleLogger';
import DiscordWebhookLogger from '../helpers/logger/DiscordWebhookLogger';
import Logger from '../helpers/logger/Logger';
import Loggers from '../helpers/logger/Loggers';
import GithubRootsProvider from '../providers/merkl-roots/GithubRootsProvider';
import MerkleRootsProvider from '../providers/merkl-roots/MerkleRootsProvider';
import OnChainProvider from '../providers/on-chain/OnChainProvider';
import RpcProvider from '../providers/on-chain/RpcProvider';

export interface DisputeContext {
  chainId: ChainId;
  onChainProvider: OnChainProvider;
  merkleRootsProvider: MerkleRootsProvider;
  blockNumber?: number;
  logger?: Logger;
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
    merkleRootsProvider: new GithubRootsProvider('https://raw.githubusercontent.com/AngleProtocol/merkl-rewards/main/', chainId),
    logger: new Loggers(loggers),
  };
};
