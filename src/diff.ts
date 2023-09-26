import { Console } from 'console';
import { Transform } from 'stream';

import { DisputeContext } from './bot/context';
import checkHoldersDiffs, { DistributionChanges, HolderDetail } from './bot/holder-checks';
import { buildMerklTree, round } from './helpers';
import { createGist } from './helpers/createGist';
import ConsoleLogger from './helpers/logger/ConsoleLogger';
import blockFromTimestamp from './providers/blockNumberFromTimestamp';

async function logDiff(details: HolderDetail[], changePerDistrib: DistributionChanges) {
  console.table(details, [
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

  console.table(
    Object.keys(changePerDistrib)
      .map((k) => {
        return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
      })
      .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
  );
}

export default async function (context: DisputeContext, fromTimeStamp: number, toTimeStamp: number) {
  const { merkleRootsProvider, onChainProvider } = context;
  const logger = new ConsoleLogger();

  const fromDate = new Date(fromTimeStamp * 1000);
  const toDate = new Date(toTimeStamp * 1000);

  console.log(`Comparing ${fromDate.toLocaleDateString()} to ${toDate.toLocaleDateString()}...`);

  const endBlock: number = parseInt(await blockFromTimestamp(toTimeStamp, context.chainId));
  console.log(`Using block ${endBlock} as onchain reference`);

  onChainProvider.setBlock(endBlock);

  const startEpoch = await merkleRootsProvider.epochFromTimestamp(fromTimeStamp);
  const endEpoch = await merkleRootsProvider.epochFromTimestamp(toTimeStamp);
  const startTree = await merkleRootsProvider.fetchTreeFor(startEpoch);
  const endTree = await merkleRootsProvider.fetchTreeFor(endEpoch);

  logger.trees(startEpoch, startTree, endEpoch, endTree);

  const endRoot = buildMerklTree(endTree.rewards).tree.getHexRoot();
  const startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();

  logger.computedRoots(startRoot, endRoot);

  await checkHoldersDiffs(context, startTree, endTree, logDiff);
}
