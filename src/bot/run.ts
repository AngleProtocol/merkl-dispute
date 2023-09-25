import { AggregatedRewardsType, ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

import { NULL_ADDRESS } from '../constants';
import { buildMerklTree, round } from '../helpers';
import logTableToGist from '../helpers/createGist';
import { OnChainParams } from '../providers/on-chain/OnChainProvider';
import { DisputeContext } from './context';
import triggerDispute from './dispute';
import { ERROR_FETCH_BLOCK_TIME, ERROR_FETCH_EPOCH, ERROR_FETCH_ONCHAIN, ERROR_FETCH_TREE, ERROR_TREE_ROOT } from './errors';
import checkHoldersDiffs from './holder-checks';

export type DisputeState = {
  error: boolean;
  code?: number;
  reason: string;
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

export async function checkDisputeOpportunity(context: DisputeContext, dumpParams?: (params: OnChainParams) => void): Promise<DisputeState> {
  const { onChainProvider, merkleRootsProvider, blockNumber, logger } = context;

  //Fetch timestamp for context
  let timestamp: number;
  try {
    timestamp = !!blockNumber ? await onChainProvider.fetchTimestampAt(blockNumber) : moment().unix();
  } catch (err) {
    return { error: true, code: ERROR_FETCH_BLOCK_TIME, reason: err };
  }

  logger?.context(context, timestamp);

  //Fetch on-chain data
  let onChainParams: OnChainParams;
  try {
    onChainParams = await onChainProvider.fetchOnChainParams(blockNumber);
  } catch (err) {
    return { error: true, code: ERROR_FETCH_ONCHAIN, reason: err };
  }

  dumpParams && dumpParams(onChainParams);
  logger?.onChainParams(onChainParams, timestamp);

  //Check if bot can dispute
  const isDisputeOff: string = isDisputeUnavailable(onChainParams, timestamp);
  if (isDisputeOff !== undefined) return { error: false, reason: isDisputeOff };

  //Fetch epochs for roots
  let startEpoch: number;
  let endEpoch: number;
  try {
    startEpoch = await merkleRootsProvider.fetchEpochFor(onChainParams.startRoot);
    endEpoch = await merkleRootsProvider.fetchEpochFor(onChainParams.endRoot);
  } catch (err) {
    return { error: true, code: ERROR_FETCH_EPOCH, reason: err };
  }

  //Fetch trees for epochs
  let startTree: AggregatedRewardsType;
  let endTree: AggregatedRewardsType;
  try {
    startTree = await merkleRootsProvider.fetchTreeFor(startEpoch);
    endTree = await merkleRootsProvider.fetchTreeFor(endEpoch);
  } catch (err) {
    return { error: true, code: ERROR_FETCH_TREE, reason: err };
  }

  logger?.trees(startEpoch, startTree, endEpoch, endTree);

  const endRoot = buildMerklTree(endTree.rewards).tree.getHexRoot();
  const startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();

  logger?.computedRoots(startRoot, endRoot);

  if (startRoot !== startTree.merklRoot)
    return {
      error: true,
      code: ERROR_TREE_ROOT,
      reason: `Start tree merkl root is not correct (computed:${abbr(startRoot)} vs alleged:${abbr(startTree.merklRoot)})`,
    };
  else if (endRoot !== endTree.merklRoot)
    return {
      error: true,
      code: ERROR_TREE_ROOT,
      reason: `End tree merkl root is not correct (computed:${abbr(endRoot)} vs alleged:${abbr(endTree.merklRoot)})`,
    };

  const isTreeInvalid = await checkHoldersDiffs(context, startTree, endTree, logTableToGist);
  if (isTreeInvalid.error) return isTreeInvalid;

  return { error: false, reason: '' };
}

export default async function run(context: DisputeContext) {
  let params: OnChainParams;
  const state: DisputeState = await checkDisputeOpportunity(context, (p) => {
    params = p;
  });

  if (state.error) {
    context.logger?.error(state.reason, state.code);
    const disputeState = await triggerDispute(params, context, state);

    if (disputeState.error) {
      context.logger?.error(disputeState.reason, disputeState.code);
    } else {
      context.logger?.success(state.reason);
    }
  } else {
    context.logger?.success(state.reason);
  }
}