import { DisputeContext } from './bot/context';
import { validateHolders } from './bot/validity';
import { buildMerklTree, round } from './helpers';
import createDiffTable from './helpers/diffTable';
import ConsoleLogger from './helpers/logger/ConsoleLogger';
import blockFromTimestamp from './providers/blockNumberFromTimestamp';

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

  const holdersReport = await validateHolders(onChainProvider, startTree, endTree);
  const res = await createDiffTable(holdersReport.details, holdersReport.changePerDistrib, !context.uploadDiffTable);
  context.uploadDiffTable && console.log("output:", res);
}
