import { ChainId } from '@angleprotocol/sdk';
import { providers } from 'ethers';

const NETWORKS: { [chainId: number]: string } = [];
for (const c of Object.keys(ChainId)) {
  try {
    NETWORKS[c] = process.env[`PROVIDER_${c}`];
  } catch {}
}

export const httpProvider = (network: keyof typeof NETWORKS) => new providers.JsonRpcProvider(NETWORKS[network]);
