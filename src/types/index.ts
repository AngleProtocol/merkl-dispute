import { AMMAlgorithmType } from '@angleprotocol/sdk';

export declare type PositionType = {
  endTimestamp: number;
  owner: string;
  startTimestamp: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
};

export type SwapType<T extends AMMAlgorithmType> = {
  amount0: string;
  amount1: string;
  amountUSD: string;
  tick: string;
  timestamp: string;
  transaction: { blockNumber: string };
} & (T extends AMMAlgorithmType.AlgebraV1_9 ? { price: string } : { sqrtPriceX96: string });

export * from './interfaces';
