import { MerklSupportedChainIdsType } from '@angleprotocol/sdk';
import dotenv from 'dotenv';

dotenv.config();

import console from 'console';
import moment from 'moment';

import { HOUR } from '../constants';
import { fetchReportData, fetchRewardJson, getReceiverToken, rewardsUnclaimed } from '../utils/report';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                 MAIN FUNCTION                                                  
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

// Timestamps will be rounded to the previous reward computation epoch
export const reportUnclaimed = async (
  chainId: MerklSupportedChainIdsType,
  token: { address: string; decimal: number },
  startTimestamp: number,
  endTimestamp: number
): Promise<void> => {
  if (startTimestamp >= endTimestamp) throw new Error('Invalid timestamps');
  /** 1 - Fetch useful data */
  const { merklIndex } = await fetchReportData(chainId);

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const { startEpoch, endEpoch, startAccumulatedRewards, endAccumulatedRewards } = await fetchRewardJson(
    chainId,
    merklIndex,
    startTimestamp,
    endTimestamp
  );

  console.log(
    `Analyzing unclaimed/claimed rewards for the token ${token.address} on Merkl over ${endEpoch - startEpoch} hours from ${moment
      .unix(startEpoch * HOUR)
      .format('ddd DD MMM YYYY HH:00')} to ${moment.unix(endEpoch * HOUR).format('ddd DD MMM YYYY HH:00')} `
  );
  const holdersRewardToken = await getReceiverToken(token.address, endAccumulatedRewards);
  const rewardsInfo = await rewardsUnclaimed(
    chainId,
    token.address,
    token.decimal,
    holdersRewardToken,
    startEpoch,
    endEpoch,
    startAccumulatedRewards,
    endAccumulatedRewards
  );
  console.table(rewardsInfo);
};
