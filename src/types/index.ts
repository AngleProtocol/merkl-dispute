import { AMMAlgorithm } from '@angleprotocol/sdk';

export declare type PositionType = {
  id: string;
  endTimestamp: number;
  owner: string;
  startTimestamp: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
};

export type SwapType<T extends AMMAlgorithm> = {
  amount0: string;
  amount1: string;
  amountUSD: string;
  tick: string;
  timestamp: string;
  transaction: { blockNumber: string };
} & (T extends AMMAlgorithm.AlgebraV1_9 ? { price: string } : { sqrtPriceX96: string });

export type Price = {
  [token: string]: number;
};

export type AccumulatedRewards = {
  Earned: number;
  Token: string;
  PoolName: string;
  Origin: string;
  Distribution: string;
  Amm: number;
  PoolAddress: string;
};

export type UserStats = Partial<{
  lowerTick: number;
  tick: number;
  upperTick: number;
  type: string;
  amount0: number;
  amount1: number;
  liquidity: string;
  inRange: boolean;
  tvl: number;
  earned: number;
  propFee: number;
  propAmount0: number;
  propAmount1: number;
  inducedAPR: number;
}>;

export type DiffCampaigns = {
  campaignId: string;
  solidityIndex: number;
  token: string;
  diff: string;
  total: string;
  remainer: string;
  ['% done']: string;
  ['% time done']: string;
  ['recipients/reasons']: number;
}[]

export type DiffRecipients = {
  campaignId: string;
  recipient: string;
  reason: string;
  diff: string;
  total: string;
  token: string;
  percentage: string;
}[]

export * from './interfaces';
