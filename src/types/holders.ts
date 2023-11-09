import { Int256 } from '@angleprotocol/sdk';

export type HolderDetail = {
  holder: string;
  diff: number;
  symbol: string;
  poolName: string;
  distribution: string;
  percent?: number;
  diffAverageBoost?: number;
  decimals?: number;
  tokenAddress?: string;
  issueSpotted?: boolean;
};

export type HolderClaims = { [address: string]: { [symbol: string]: string } };

export type DistributionChange = {
  diff: number;
  symbol: string;
  poolName: string;
  pool: any;
  recipients: number;
  ratePerEpoch: number;
  epoch: number;
};

export type DistributionChanges = { [address: string]: DistributionChange };
export type UnclaimedRewards = { [address: string]: { [symbol: string]: Int256 } };
export type HoldersReport = {
  details: HolderDetail[];
  changePerDistrib: DistributionChanges;
  unclaimed: UnclaimedRewards;
  negativeDiffs: string[];
  overclaimed?: string[];
  overDistributed?: string[];
};
