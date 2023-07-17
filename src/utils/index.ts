import 'dotenv/config';

import { ChainId, EnvType } from '@angleprotocol/sdk';

export function getEnv(): EnvType {
  const value = process.env['ENV'] as EnvType;
  if (!value) {
    throw new Error(`❌ Missing environment variable ENV`);
  }
  return value;
}

export function getChainId(): ChainId {
  const value = process.env['CHAINID'];
  if (!value) {
    throw new Error(`❌ Missing environment variable ENV`);
  }
  return parseInt(value) as ChainId;
}
