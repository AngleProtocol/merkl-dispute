import { AggregatedRewardsType } from '@angleprotocol/sdk';

import MerkleRootsProvider from '../../src/providers/merkl-roots/MerkleRootsProvider';

export default class ManualMerkleRootsProvider extends MerkleRootsProvider {
  constructor() {
    super({ retries: 1, delay: 1, multiplier: 1 });
  }

  override epoch = async () => new Promise<number>((_, reject) => reject());
  override tree = async () => new Promise<AggregatedRewardsType>((_, reject) => reject());
  override epochFromTimestamp = async () => new Promise<number>((_, reject) => reject());
}
