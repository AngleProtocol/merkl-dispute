import { AggregatedRewardsType } from '@angleprotocol/sdk';
import { BigNumber } from 'ethers';

import { DisputeContext } from '../../bot/run';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import Logger from './Logger';
import moment from 'moment';

const chains = {
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  1101: 'Polygon zvEVM',
};

export default class ConsoleLogger extends Logger {
  override context = (context: DisputeContext, timestamp?: number) => {
    const date = new Date(timestamp * 1000);
    console.groupCollapsed(`[Merkle Dispute Bot] running on:`);
    console.log('chainId:', chains[context.chainId] ?? '', `(${context.chainId})`);
    console.log(
      'block:',
      !!context.blockNumber ? context.blockNumber : 'latest',
      `(${date.toLocaleDateString()} at ${date.toLocaleTimeString()})`
    );
    console.groupEnd();
  };
  override onChainParams = (params: OnChainParams, timestamp?: number) => {
    const endDate = new Date(params.endOfDisputePeriod * 1000);
    const currentDate = new Date(timestamp * 1000);

    console.groupCollapsed(`Fetched on-chain params:`);

    console.group('token');
    console.log('address:', params.disputeToken);
    console.log('amount:', BigNumber.from(params.disputeAmount).toString());
    console.groupEnd();

    console.group('dispute');

    console.log('period:', params.disputePeriod, 'hour(s)');
    console.log('ends:', `${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`);
    console.log('can dispute:', params.endOfDisputePeriod >= timestamp);
    console.groupEnd();

    console.groupEnd();
  };
  override trees = (startEpoch: number, startTree: AggregatedRewardsType, endEpoch: number, endTree: AggregatedRewardsType) => {
    console.group('Fetched epochs/merkle roots:');
    console.log('start:', startEpoch, startTree.merklRoot);
    console.log('end:', endEpoch, endTree.merklRoot);
    console.groupEnd();
  };
  override computedRoots = (start: string, end: string) => {
    console.group('Computed roots:');
    console.log('start:', start);
    console.log('end:', end);
    console.groupEnd();
  };
}
