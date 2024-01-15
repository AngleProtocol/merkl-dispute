import { AggregatedRewardsType } from '@angleprotocol/sdk';
import axios from 'axios';

import { ExponentialFetchParams } from '../ExponentialBackoffProvider';
import MerkleRootsProvider from './MerkleRootsProvider';

export type MerklIndexType = { [merklRoot: string]: number };

export default class GoogleRootsProvider extends MerkleRootsProvider {
  url: string;
  merklIndex: MerklIndexType;
  chainId: number;

  constructor(url: string, chainId: number, fetchParams?: ExponentialFetchParams) {
    super(fetchParams);
    this.url = `${url}/${chainId}`;
  }

  async cacheMerklIndex(): Promise<void> {
    const indexUrl = `${this.url}/index.json`;
    const res = await axios.get<MerklIndexType>(indexUrl, {
      timeout: 60_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    this.merklIndex = res.data;
  }

  override tree = async (epoch: number) => {
    const rewardsUrl = `${this.url}/backup/rewards_${epoch}.json`;

    try {
      const res = await axios.get<AggregatedRewardsType>(rewardsUrl, {
        timeout: 60_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return res.data;
    } catch (err) {
      console.log('??', rewardsUrl, err);
    }
  };

  override epoch = async (root: string) => {
    if (!this.merklIndex) await this.cacheMerklIndex();

    return this.merklIndex[root];
  };

  override epochFromTimestamp = async (timestamp: number): Promise<number> => {
    if (!this.merklIndex) await this.cacheMerklIndex();

    let epoch = Math.floor(timestamp / 3600);

    while (!Object.values(this.merklIndex).includes(epoch)) {
      epoch -= 1;
    }
    return epoch;
  };
}
