import { ChainId } from '@angleprotocol/sdk';

export const TVL_THRESHOLD = 10;
export const BATCH_NUMBER = 1_000;
/**
 * Contract addresses
 */
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const supportedChains = [!!parseInt(process.env.CHAINID) ? parseInt(process.env.CHAINID) : ChainId.MAINNET];
