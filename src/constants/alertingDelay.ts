import { ChainId } from '@angleprotocol/sdk';

export const ALERTING_DELAY: { [chainId: number]: number } = {
  [ChainId.POLYGON]: 5,
  [ChainId.BASE]: 5,
  [ChainId.MAINNET]: 16,
  [ChainId.POLYGONZKEVM]: 16,
  [ChainId.CORE]: 16,
  [ChainId.THUNDERCORE]: 16,
  [ChainId.ARBITRUM]: 7,
  [ChainId.OPTIMISM]: 9,
};
