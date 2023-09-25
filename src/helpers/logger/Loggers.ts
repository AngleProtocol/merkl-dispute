import { AggregatedRewardsType } from '@angleprotocol/sdk';

import { DisputeContext } from '../../bot/context';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import Logger from './Logger';

export default class Loggers extends Logger {
  loggers: Logger[];

  constructor(loggers: Logger[]) {
    super();
    this.loggers = loggers;
  }

  override context = (context: DisputeContext, timestamp?: number) => this.loggers.forEach((l) => l.context(context, timestamp));
  override onChainParams = (params: OnChainParams, timestamp?: number) => this.loggers.forEach((l) => l.onChainParams(params, timestamp));
  override trees = (startEpoch: number, startTree: AggregatedRewardsType, endEpoch: number, endTree: AggregatedRewardsType) =>
    this.loggers.forEach((l) => l.trees(startEpoch, startTree, endEpoch, endTree));
  override computedRoots = (start: string, end: string) => this.loggers.forEach((l) => l.computedRoots(start, end));
  override error = (reason: string, code?: number) => this.loggers.forEach((l) => l.error(reason, code));
  override success = (reason: string) => this.loggers.forEach((l) => l.success(reason));
}
