import { AggregatedRewardsType, ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

import { NULL_ADDRESS } from '../constants';
import Logger from '../helpers/logger/Logger';
import MerkleRootsProvider from '../providers/merkl-roots/MerkleRootsProvider';
import OnChainProvider, { OnChainParams } from '../providers/on-chain/OnChainProvider';
import { buildMerklTree } from '../helpers';
import checkNegativeDiffs from './negative-diffs';

export interface DisputeContext {
  chainId: ChainId;
  onChainProvider: OnChainProvider;
  merkleRootsProvider: MerkleRootsProvider;
  blockNumber?: number;
  logger: Logger;
}

export type DisputeState = {
  error: boolean;
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

//TODO: Add holders checks
function hasNegativeDiffs(startTree: AggregatedRewardsType, endTree: AggregatedRewardsType): boolean {
  return true;
}

async function checkDisputeOpportunity(context: DisputeContext): Promise<DisputeState> {
  const { onChainProvider, merkleRootsProvider, blockNumber, logger } = context;

  //TODO: check call
  const timestamp = !!blockNumber ? await onChainProvider.fetchTimestampAt(blockNumber) : moment().unix();

  logger.context(context, timestamp);

  const onChainParams: OnChainParams = await onChainProvider.fetchOnChainParams(blockNumber);

  logger.onChainParams(onChainParams, timestamp);

  const isDisputeOff: string = isDisputeUnavailable(onChainParams, timestamp);
  if (isDisputeOff !== undefined) return { error: false, reason: isDisputeOff };

  const startEpoch = await merkleRootsProvider.fetchEpochFor(onChainParams.startRoot);
  const endEpoch = await merkleRootsProvider.fetchEpochFor(onChainParams.endRoot);

  const startTree = await merkleRootsProvider.fetchTreeFor(startEpoch);
  const endTree = await merkleRootsProvider.fetchTreeFor(endEpoch);

  logger.trees(startEpoch, startTree, endEpoch, endTree);

  const endRoot = buildMerklTree(endTree.rewards).tree.getHexRoot();
  const startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();

  logger.computedRoots(startRoot, endRoot);

  if (startRoot !== startTree.merklRoot)
    return {
      error: true,
      reason: `Start tree merkl root is not correct (computed:${abbr(startRoot)} vs alleged:${abbr(startTree.merklRoot)})`,
    };
  if (endRoot !== endTree.merklRoot)
    return { error: true, reason: `End tree merkl root is not correct (computed:${abbr(endRoot)} vs alleged:${abbr(endTree.merklRoot)})` };

  const isTreeInvalid = await checkNegativeDiffs(context, startTree, endTree);
  if (isTreeInvalid.error) return isTreeInvalid;

  return { error: false, reason: '' };
}

export default async function run(context: DisputeContext) {
  const { error, reason }: DisputeState = await checkDisputeOpportunity(context);

  if (error) {
    console.log(`⚔️  DISPUTE: ${reason}`);
  } else {
    console.log(`✅  Nothing to report: ${reason}`);
  }
}
