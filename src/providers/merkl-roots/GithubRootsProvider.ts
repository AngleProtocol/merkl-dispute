import { AggregatedRewardsType } from '@angleprotocol/sdk';
import axios from 'axios';

import { MerklIndexType } from '../../routes';
import { ExponentialFetchParams } from '../ExponentialBackoffProvider';
import MerkleRootsProvider from './MerkleRootsProvider';

export default class GithubRootsProvider extends MerkleRootsProvider {
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
      timeout: 25_000,
    });

    this.merklIndex = res.data;
  }

  override tree = async (epoch: number) => {
    const rewardsUrl = `${this.url}/backup/rewards_${epoch}.json`;

    try {
      const res = await axios.get<AggregatedRewardsType>(rewardsUrl, {
        timeout: 25_000,
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
}
