import { AggregatedRewardsType, ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

import { NULL_ADDRESS } from '../constants';
import { buildMerklTree, round } from '../helpers';
import logTableToGist from '../helpers/createGist';
import { OnChainParams } from '../providers/on-chain/OnChainProvider';
import { DisputeContext } from './context';
import triggerDispute from './dispute';
import { DisputeError } from './errors';
import checkHoldersDiffs from './holder-checks';
import { on } from 'events';

export type DisputeState = {
  error: boolean;
  code?: number;
  reason: string;
  report?: CheckUpReport;
};

export type CheckUpReport = {
  blockNumber?: number;
  startEpoch?: number;
  startRoot?: string;
  endEpoch?: number;
  endRoot?: string;
  chainId?: ChainId;
};

function abbr(hash: string | number) {
  return hash.toString().substring(0, 8);
}

function isDisputeUnavailable({ disputer, disputeToken, endOfDisputePeriod }: OnChainParams, currentTimeStamp: number): string | undefined {
  if (!!disputer && disputer !== NULL_ADDRESS) return 'Already disputed';
  else if (disputeToken === NULL_ADDRESS) return 'No dispute token set';
  else if (endOfDisputePeriod <= currentTimeStamp) return 'Not in dispute period';
  return undefined;
}

export async function checkDisputeOpportunity(
  context: DisputeContext,
  dumpParams?: (params: OnChainParams) => void
): Promise<DisputeState> {
  const { onChainProvider, merkleRootsProvider, blockNumber, logger } = context;
  const report: CheckUpReport = {};

  //Fetch timestamp for context
  let timestamp: number;
  try {
    timestamp = !!blockNumber ? await onChainProvider.fetchTimestampAt(blockNumber) : moment().unix();
    report.blockNumber = blockNumber ?? (await onChainProvider.mountLastBlock());
  } catch (err) {
    return { error: true, code: DisputeError.BlocktimeFetch, reason: err };
  }

  logger?.context(context, timestamp);

  //Fetch on-chain data
  let onChainParams: OnChainParams;
  try {
    onChainProvider.setBlock(blockNumber);
    onChainParams = await onChainProvider.fetchOnChainParams();
  } catch (err) {
    return { error: true, code: DisputeError.OnChainFetch, reason: err };
  }

  dumpParams && dumpParams(onChainParams);
  logger?.onChainParams(onChainParams, timestamp);

  //Check if bot can dispute
  const isDisputeOff: string = isDisputeUnavailable(onChainParams, timestamp);
  if (isDisputeOff !== undefined) return { error: false, reason: isDisputeOff };

  try {
    report.startEpoch = await merkleRootsProvider.fetchEpochFor(onChainParams.startRoot);
    report.endEpoch = await merkleRootsProvider.fetchEpochFor(onChainParams.endRoot);
  } catch (err) {
    return { error: true, code: DisputeError.EpochFetch, reason: err };
  }

  //Fetch trees for epochs
  let startTree: AggregatedRewardsType;
  let endTree: AggregatedRewardsType;
  try {
    startTree = await merkleRootsProvider.fetchTreeFor(report.startEpoch);
    endTree = await merkleRootsProvider.fetchTreeFor(report.endEpoch);
  } catch (err) {
    return { error: true, code: DisputeError.TreeFetch, reason: err };
  }

  logger?.trees(report.startEpoch, startTree, report.endEpoch, endTree);

  report.endRoot = buildMerklTree(endTree.rewards).tree.getHexRoot();
  report.startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();

  logger?.computedRoots(report.startRoot, report.endRoot);

  if (report.startRoot !== startTree.merklRoot)
    return {
      error: true,
      code: DisputeError.TreeRoot,
      reason: `Start tree merkl root is not correct (computed:${abbr(report.startRoot)} vs alleged:${abbr(startTree.merklRoot)})`,
    };
  else if (report.endRoot !== endTree.merklRoot)
    return {
      error: true,
      code: DisputeError.TreeRoot,
      reason: `End tree merkl root is not correct (computed:${abbr(report.endRoot)} vs alleged:${abbr(endTree.merklRoot)})`,
    };

  const isTreeInvalid = await checkHoldersDiffs(context, startTree, endTree, logTableToGist);
  if (isTreeInvalid.error) return isTreeInvalid;

  console.log('report', report);

  return { error: false, reason: '' };
}

export default async function run(context: DisputeContext) {
  let params: OnChainParams;
  const state: DisputeState = await checkDisputeOpportunity(context, (p) => {
    params = p;
  });

  if (state.error) {
    context.logger?.error(context, state.reason, state.code);
    const disputeState = await triggerDispute(params, context, state);

    if (disputeState.error) {
      context.logger?.error(context, disputeState.reason, disputeState.code);
    } else {
      context.logger?.success(context, state.reason);
    }
  } else {
    context.logger?.success(context, state.reason ?? 'Nothing to report');
  }
}
