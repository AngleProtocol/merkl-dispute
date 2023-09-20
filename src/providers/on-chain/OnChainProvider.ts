import { BigNumber } from 'ethers';

import { ExponentialBackoffProvider, ExponentialFetchParams } from '../ExponentialBackoffProvider';

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

  abstract onChainParams: (blockNumber: number | undefined) => Promise<OnChainParams>;
  abstract timestampAt: (blockNumber: number) => Promise<number>;

  async fetchOnChainParams(blockNumber: number | undefined = undefined): Promise<OnChainParams> {
    return this.retryWithExponentialBackoff(this.onChainParams, this.fetchParams, blockNumber);
  }

  async fetchTimestampAt(blockNumber: number): Promise<number> {
    return this.retryWithExponentialBackoff(this.timestampAt, this.fetchParams, blockNumber);
  }
}
