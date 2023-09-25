import { AggregatedRewardsType } from '@angleprotocol/sdk';
import chalk from 'chalk';
import { BigNumber } from 'ethers';

import { DisputeContext } from '../../bot/context';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import Logger from './Logger';

const chains = {
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  1101: 'Polygon zvEVM',
};

export default class DiscordWebhookLogger extends Logger {
  override context = (context: DisputeContext, timestamp?: number) => {};
  override onChainParams = (params: OnChainParams, timestamp?: number) => {};
  override trees = (startEpoch: number, startTree: AggregatedRewardsType, endEpoch: number, endTree: AggregatedRewardsType) => {};
  override computedRoots = (start: string, end: string) => {};
  override error = (reason: string, code?: number) => {
    
  };

  override success = (reason: string) => {};
}
