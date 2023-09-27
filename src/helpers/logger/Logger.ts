import { AggregatedRewardsType } from '@angleprotocol/sdk';

import { DisputeContext } from '../../bot/context';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import { MerklReport } from '../../types/bot';

export default abstract class Logger {
  context: (context: DisputeContext, timestamp?: number) => void;
  onChainParams: (params: OnChainParams, timestamp?: number) => void;
  trees: (startEpoch: number, startTree: AggregatedRewardsType, endEpoch: number, endTree: AggregatedRewardsType) => void;
  computedRoots: (start: string, end: string) => void;
  error: (context: DisputeContext, reason: string, code?: number, report?: MerklReport) => Promise<void>;
  success: (context: DisputeContext, reason: string, report?: MerklReport) => Promise<void>;
  disputeError: (context: DisputeContext, reason: string, code?: number, report?: MerklReport) => Promise<void>;
  disputeSuccess: (context: DisputeContext, reason: string, report?: MerklReport) => Promise<void>;
}
