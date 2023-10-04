import { AggregatedRewardsType } from '@angleprotocol/sdk';

import { ExponentialBackoffProvider, ExponentialFetchParams } from '../ExponentialBackoffProvider';

export default abstract class MerkleRootsProvider extends ExponentialBackoffProvider {
  constructor(fetchParams: ExponentialFetchParams = { retries: 5, delay: 500, multiplier: 2 }) {
    super(fetchParams);
  }

  abstract epoch(root: string): Promise<number>;
  abstract tree(epoch: number): Promise<AggregatedRewardsType>;
  abstract epochFromTimestamp(timestamp: number): Promise<number>;

  async fetchEpochFor(root: string): Promise<number> {
    return this.retryWithExponentialBackoff(this.epoch, this.fetchParams, root);
  }

  async fetchTreeFor(epoch: number): Promise<AggregatedRewardsType> {
    return this.retryWithExponentialBackoff(this.tree, this.fetchParams, epoch);
  }
}
