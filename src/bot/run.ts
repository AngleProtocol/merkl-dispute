import { AggregatedRewardsType, ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

import { NULL_ADDRESS } from '../constants';
import { buildMerklTree, round } from '../helpers';
import { OnChainParams } from '../providers/on-chain/OnChainProvider';
import { DisputeContext } from './context';
import checkHoldersDiffs from './holder-checks';
import { Console } from 'console';
import { Transform } from 'stream';
import { createGist } from '../utils';

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

async function logGist(details, changePerDistrib) {
  const ts = new Transform({
    transform(chunk, _, cb) {
      cb(null, chunk);
    },
  });
  const logger = new Console({ stdout: ts });

  logger.table(details, [
    'holder',
    'diff',
    'symbol',
    'poolName',
    'distribution',
    'percent',
    'diffAverageBoost',
    'totalCumulated',
    'alreadyClaimed',
    'issueSpotted',
  ]);

  logger.table(
    Object.keys(changePerDistrib)
      .map((k) => {
        return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
      })
      .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
  );

  await createGist('A gist', (ts.read() || '').toString());
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

  const isTreeInvalid = await checkHoldersDiffs(context, startTree, endTree, logGist);
  if (isTreeInvalid.error) return isTreeInvalid;

  return { error: false, reason: '' };
}

export default async function run(context: DisputeContext) {
  const { error, reason }: DisputeState = await checkDisputeOpportunity(context);

  if (error) {
    context.logger.error(reason);
  } else {
    context.logger.success(reason);
  }
}
