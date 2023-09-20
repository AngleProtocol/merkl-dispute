import { AggregatedRewardsType } from '@angleprotocol/sdk';

import { DisputeContext } from '../../bot/run';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';

export default class Logger {
  context: (context: DisputeContext, timestamp?: number) => void;
  onChainParams: (params: OnChainParams, timestamp?: number) => void;
  trees: (startEpoch: number, startTree: AggregatedRewardsType, endEpoch: number, endTree: AggregatedRewardsType) => void;
  computedRoots: (start: string, end: string) => void;
}