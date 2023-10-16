import moment from 'moment';

import { DisputeContext } from './bot/context';
import { validateClaims, validateHolders } from './bot/validity';
import { buildMerklTree } from './helpers';
import createDiffTable from './helpers/diffTable';
import ConsoleLogger from './helpers/logger/ConsoleLogger';
import blockFromTimestamp from './providers/blockNumberFromTimestamp';

export default async function (context: DisputeContext, fromTimeStamp: number, toTimeStamp: number) {
  const { merkleRootsProvider, onChainProvider } = context;
  const logger = new ConsoleLogger();

  const fromDate = moment.unix(fromTimeStamp);
  const toDate = moment.unix(toTimeStamp);

  console.log(`Comparing ${fromDate.format('MMMM Do YYYY, h:mm:ss a')} to ${toDate.format('MMMM Do YYYY, h:mm:ss a')}...`);

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

  const holdersReport = await validateClaims(onChainProvider, await validateHolders(onChainProvider, startTree, endTree));

  const res = await createDiffTable(holdersReport.details, holdersReport.changePerDistrib, !context.uploadDiffTable);
  context.uploadDiffTable && console.log('output:', res);
}
