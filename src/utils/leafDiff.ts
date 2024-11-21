import { DistributionCreator__factory, Distributor__factory, registry } from '@angleprotocol/sdk';
import { BigNumber, ethers } from 'ethers';

import { httpProvider } from '../providers';
import { ExpandedLeaf } from '../providers/tree';

export const wasReallocated = async (chainId: number, leaf: ExpandedLeaf) => {
  const provider = httpProvider(chainId);
  const distributionCreatorAddress = registry(chainId).Merkl.DistributionCreator;
  const distributorAddress = registry(chainId).Merkl.Distributor;
  const creator = DistributionCreator__factory.connect(distributionCreatorAddress, provider);
  const distributor = Distributor__factory.connect(distributorAddress, provider);

  const to = await creator.campaignReallocation(leaf.campaignId, leaf.recipient);
  const claimed = await distributor.claimed(leaf.campaignId, leaf.recipient);

  return to !== ethers.constants.AddressZero && claimed.amount.eq(BigNumber.from('0'));
};
