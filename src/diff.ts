import { MerklChainId } from '@angleprotocol/sdk';
import axios from 'axios';
import moment from 'moment';

import { DisputeContext } from './bot/context';
import { MERKL_API_URL } from './constants';
import ConsoleLogger from './helpers/logger/ConsoleLogger';
import blockFromTimestamp from './providers/blockNumberFromTimestamp';
import { BaseTree } from './providers/tree';
import { fetchCampaigns, fetchLeaves } from './utils/merklAPI';

export default async function (context: DisputeContext, fromTimeStamp: number, toTimeStamp: number) {
  const { onChainProvider } = context;
  const logger = new ConsoleLogger();

  const fromDate = moment.unix(fromTimeStamp);
  const toDate = moment.unix(toTimeStamp);

  console.log(`Comparing ${fromDate.format('MMMM Do YYYY, h:mm:ss a')} to ${toDate.format('MMMM Do YYYY, h:mm:ss a')}...`);

  const endBlock: number = parseInt(await blockFromTimestamp(toTimeStamp, context.chainId));
  console.log(`Using block ${endBlock} as onchain reference`);

  onChainProvider.setBlock(endBlock);
  const startRootData = (await axios.get(`${MERKL_API_URL}/rootForTimestamp?chainId=${context.chainId}&timestamp=${fromTimeStamp}`)).data;
  const endRootData = (await axios.get(`${MERKL_API_URL}/rootForTimestamp?chainId=${context.chainId}&timestamp=${toTimeStamp}`)).data;

  const startLeaves = await fetchLeaves(context.chainId, startRootData.root);
  const startTree = new BaseTree(startLeaves, context.chainId as MerklChainId);

  const endLeaves = await fetchLeaves(context.chainId, endRootData.root);
  const endTree = new BaseTree(endLeaves, context.chainId as MerklChainId);

  // logger.trees(startEpoch, startTree, endEpoch, endTree);

  const endRoot = startTree.merklRoot();
  const startRoot = endTree.merklRoot();

  logger.computedRoots(startRoot, endRoot);

  const campaigns = await fetchCampaigns(context.chainId);

  const { diffCampaigns, diffRecipients, negativeDiffs } = BaseTree.computeDiff(startTree, endTree, campaigns);

  console.log('diffCampaigns:', diffCampaigns);
  console.log('diffRecipients:', diffRecipients);
  console.log('negativeDiffs:', negativeDiffs);
}
