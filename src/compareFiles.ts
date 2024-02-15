import fs from 'fs';

import { DisputeContext } from './bot/context';
import { validateClaims, validateHolders } from './bot/validity';
import { buildMerklTree } from './helpers';
import createDiffTable from './helpers/diffTable';
import ConsoleLogger from './helpers/logger/ConsoleLogger';

export default async function (context: DisputeContext) {
  const { onChainProvider } = context;
  const logger = new ConsoleLogger();

  const startTree = JSON.parse(fs.readFileSync('old_polygon.json', 'utf8'));
  const endTree = JSON.parse(fs.readFileSync('new_polygon.json', 'utf8'));

  logger.trees(0, startTree, 0, endTree);

  const endRoot = buildMerklTree(endTree.rewards).getHexRoot();
  const startRoot = buildMerklTree(startTree.rewards).getHexRoot();

  logger.computedRoots(startRoot, endRoot);

  const holdersReport = await validateClaims(onChainProvider, await validateHolders(onChainProvider, startTree, endTree));

  const res = await createDiffTable(holdersReport.details, holdersReport.changePerDistrib, !context.uploadDiffTable);
  context.uploadDiffTable && console.log('output:', res);
}
