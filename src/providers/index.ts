import { ChainId } from '@angleprotocol/sdk';
import { providers } from 'ethers';

import { supportedChains } from '../constants';

export const requireEnvVars = <T extends string>(vars: T[]): Record<(typeof vars)[number], string> => {
  const missingEnvVars = vars.filter((v) => !process.env[v]);
  if (missingEnvVars.length) {
    throw new Error(`Missing env vars: ${missingEnvVars.join(', ')}`);
  }
  return vars.reduce((acc, envVar) => {
    acc[envVar] = process.env[envVar] as string;
    return acc;
  }, {} as Record<(typeof vars)[number], string>);
};

const providers_keys: string[] = [];
for (const c of supportedChains) {
  providers_keys.push(`PROVIDER_${c}`);
}
if (!providers_keys.includes(`PROVIDER_1`)) providers_keys.push('PROVIDER_1');
const envVariables = requireEnvVars(
  process.env.ENV === 'prod' ? ['GCP_PROJECT_ID', 'GCP_KEEPER_PK_SECRET_NAME', ...providers_keys] : providers_keys
);

const NETWORKS: { [chainId: number]: string } = [];
for (const c of supportedChains) {
  NETWORKS[c] = envVariables[`PROVIDER_${c}`];
}
if (!supportedChains.includes(ChainId.MAINNET)) NETWORKS[ChainId.MAINNET] = envVariables[`PROVIDER_${ChainId.MAINNET}`];

export const httpProvider = (network: keyof typeof NETWORKS) => new providers.JsonRpcProvider(NETWORKS[network]);
