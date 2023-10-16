import { AggregatedRewardsType, NETWORK_LABELS } from '@angleprotocol/sdk';
import chalk from 'chalk';
import { BigNumber } from 'ethers';

import { DisputeContext } from '../../bot/context';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import { MerklReport } from '../../types/bot';
import Logger from './Logger';

export default class ConsoleLogger extends Logger {
  override context = (context: DisputeContext, timestamp?: number) => {
    const date = new Date(timestamp * 1000);

    console.log(
      chalk.yellow(
        `Merkl Dispute Bot checks ${NETWORK_LABELS[context.chainId] ?? ''} (${context.chainId}) at block ${
          !!context.blockNumber ? context.blockNumber : 'latest'
        } (${date.toLocaleDateString()} at ${date.toLocaleTimeString()})`
      )
    );
  };
  override onChainParams = (params: OnChainParams, timestamp?: number) => {
    const endDate = new Date(params.endOfDisputePeriod * 1000);
    const log = (...a) => console.log(chalk.blue(...a));

    console.groupCollapsed(chalk.blue(`On-chain data:`));

    log('token address:', params.disputeToken);
    log('token amount:', BigNumber.from(params.disputeAmount).toString());
    log('dispute period:', params.disputePeriod, 'hour(s)');
    log('dispute ends:', `${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`);
    log('dispute open:', params.endOfDisputePeriod >= timestamp);

    console.groupEnd();
  };
  override trees = (startEpoch: number, startTree: AggregatedRewardsType, endEpoch: number, endTree: AggregatedRewardsType) => {
    const log = (...a) => console.log(chalk.green(...a));

    console.group(chalk.green('Epochs/merkle roots data:'));
    log('startEpoch:', startEpoch);
    log('endEpoch:', endEpoch);
    log('startRoot:', startTree.merklRoot);
    log('endRoot:', endTree.merklRoot);
    console.groupEnd();
  };
  override computedRoots = (start: string, end: string) => {
    console.group('Computed roots:');
    console.log('startRoot:', start);
    console.log('endRoot:', end);
    console.groupEnd();
  };

  override error = async (context, reason: string, code?: number, report?: MerklReport) => {
    const log = (...a) => console.log(chalk.red(...a));

    log('[CHECKS ERROR]:', reason);
  };

  override success = async (context, reason: string, report?: MerklReport) => {
    const log = (...a) => console.log(chalk.green(...a));

    log('[CHECKS OK]:', reason);
  };

  override disputeError = async (context, reason: string, code?: number, report?: MerklReport) => {
    const log = (...a) => console.log(chalk.red(...a));

    log('[DISPUTE ERROR]:', reason);
  };

  override disputeSuccess = async (context, reason: string, report?: MerklReport) => {
    const log = (...a) => console.log(chalk.green(...a));

    log('[DISPUTE SUCCESS ]:', reason);
  };
}
