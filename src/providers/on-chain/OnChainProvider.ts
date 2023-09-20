import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { BigNumber } from 'ethers';

import { ExponentialBackoffProvider, ExponentialFetchParams } from '../ExponentialBackoffProvider';
import { AMMType } from '@angleprotocol/sdk';
import { HolderClaims, HolderDetail } from '../../bot/holder-checks';

export type OnChainParams = {
  disputeToken: string;
  disputeAmount: BigNumber;
  disputePeriod: number;
  endOfDisputePeriod: number;
  disputer: string;
  endRoot: string;
  startRoot: string;
  currentRoot: string;
};

export default abstract class OnChainProvider extends ExponentialBackoffProvider {
  fetchParams: ExponentialFetchParams;

  constructor(fetchParams: ExponentialFetchParams = { retries: 5, delay: 500, multiplier: 2 }) {
    super(fetchParams);
  }

  protected abstract onChainParams: (blockNumber: number | undefined) => Promise<OnChainParams>;
  protected abstract timestampAt: (blockNumber: number) => Promise<number>;
  protected abstract activeDistributions: (blockNumber?: number) => Promise<ExtensiveDistributionParametersStructOutput[]>;
  protected abstract poolName: (pool: string, amm: AMMType, blockNumber?: number) => Promise<string>;
  protected abstract claimed: (holderDetails: HolderDetail[]) => Promise<HolderClaims>;

  async fetchClaimed(holderDetails: HolderDetail[]): Promise<HolderClaims> {
    return this.retryWithExponentialBackoff(this.claimed, this.fetchParams, holderDetails);
  }

  async fetchPoolName(pool: string, amm: AMMType, blockNumber?: number): Promise<string> {
    return this.retryWithExponentialBackoff(this.poolName, this.fetchParams, pool, amm, blockNumber);
  }

  async fetchActiveDistributions(blockNumber: number): Promise<ExtensiveDistributionParametersStructOutput[]> {
    return this.retryWithExponentialBackoff(this.activeDistributions, this.fetchParams, blockNumber);
  }

  async fetchOnChainParams(blockNumber: number | undefined = undefined): Promise<OnChainParams> {
    return this.retryWithExponentialBackoff(this.onChainParams, this.fetchParams, blockNumber);
  }

  async fetchTimestampAt(blockNumber: number): Promise<number> {
    return this.retryWithExponentialBackoff(this.timestampAt, this.fetchParams, blockNumber);
  }
}
