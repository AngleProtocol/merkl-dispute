import { AggregatedRewardsType, buildMerklTree } from '@angleprotocol/sdk';

import endJson from './jsons/end.json';
import startJson from './jsons/start.json';

console.log('Start merkl root: ', buildMerklTree((startJson as unknown as AggregatedRewardsType).rewards).tree.getHexRoot());
console.log('end merkl root: ', buildMerklTree((endJson as unknown as AggregatedRewardsType).rewards).tree.getHexRoot());
// console.log('end merkl root: ', buildMerklTree((endJson as unknown as AggregatedRewardsType).rewards).transactionData);
