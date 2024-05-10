import {
  ChainId,
  DistributionCreator__factory,
  MULTICALL_ADDRESS,
  MerklChainId,
  Multicall,
  Multicall__factory,
  registry,
} from '@angleprotocol/sdk';
import { providers as p } from 'ethers';

export const providers = Object.keys(ChainId).reduce((prev, chainId) => {
  const url = process.env?.[`PROVIDER_${chainId}`];
  if (!!url) prev[chainId] = new p.StaticJsonRpcProvider(url);
  return prev;
}, {} as { [chainId in ChainId]: p.StaticJsonRpcProvider | p.InfuraProvider });

export function provider(chainId: MerklChainId): p.StaticJsonRpcProvider | p.InfuraProvider {
  return providers[chainId];
}

export const multicalls = Object.keys(ChainId).reduce((prev, chainId) => {
  if (!!providers[chainId])
    prev[chainId] = Multicall__factory.connect(MULTICALL_ADDRESS(chainId as unknown as ChainId), providers[chainId]);
  return prev;
}, {} as { [chainId in ChainId]: Multicall });

export const DistributionCreator = (chainId: MerklChainId) =>
  DistributionCreator__factory.connect(registry(chainId)?.Merkl?.DistributionCreator, providers[chainId]);
