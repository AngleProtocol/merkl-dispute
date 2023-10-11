import { AMMType, Int256, MerklSupportedChainIdsType } from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import { BigNumber } from 'ethers';

dotenv.config();

import console from 'console';
import { getAddress } from 'ethers/lib/utils';
import moment from 'moment';

import { HOUR } from '../constants';
import { AccumulatedRewards } from '../types';
import {
  fetchReportData,
  fetchRewardJson,
  getReceiverToken,
  poolName,
  poolParamsCheck,
  rewardsBreakdownPool,
  rewardsClaimed,
  rewardsUnclaimed,
  statsPoolRewardId,
} from '../utils/report';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                 MAIN FUNCTION                                                  
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

// Timestamps will be rounded to the previous reward computation epoch
export const reportPool = async (
  chainId: MerklSupportedChainIdsType,
  amm: AMMType,
  pool: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<void> => {
  poolParamsCheck(pool, startTimestamp, endTimestamp);
  /** 1 - Fetch useful data */
  const { prices, merklIndex, merklAPIData } = await fetchReportData(chainId);

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const { startEpoch, endEpoch, startAccumulatedRewards, endAccumulatedRewards } = await fetchRewardJson(
    chainId,
    merklIndex,
    startTimestamp,
    endTimestamp
  );

  console.log(
    `Analyzing rewards for the pool ${pool} on Merkl over ${endEpoch - startEpoch} hours from ${moment
      .unix(startEpoch * HOUR)
      .format('ddd DD MMM YYYY HH:00')} to ${moment.unix(endEpoch * HOUR).format('ddd DD MMM YYYY HH:00')} `
  );

  const { distributionFiltered, rewardsTokenAmount } = await statsPoolRewardId(chainId, pool, startEpoch, endEpoch, prices);
  console.table(rewardsTokenAmount);
  console.table(distributionFiltered);

  //   const { diffRewards, rewardsOriginBreakdown, holders } = await rewardsBreakdownPool(pool, startAccumulatedRewards, endAccumulatedRewards);
  //   console.table(diffRewards);
  //   console.table(rewardsOriginBreakdown);

  //   await [...new Set(Object.keys(rewardsTokenAmount))].map(async (token, i) => {
  //     if (i === 0) return;
  //     const breakdownUserClaimed = await rewardsClaimed(
  //       chainId,
  //       pool,
  //       rewardsTokenAmount[token].tokenAddress,
  //       rewardsTokenAmount[token].tokenDecimal,
  //       holders,
  //       startEpoch,
  //       endEpoch,
  //       startAccumulatedRewards,
  //       endAccumulatedRewards
  //     );
  //     console.log(`\nThe ${token} rewards where claimed for the specific pool during this period: \n`);
  //     console.table(breakdownUserClaimed);
  //   });

  const holdersRewardToken = await getReceiverToken(rewardsTokenAmount['xGRAIL'].tokenAddress, endAccumulatedRewards);
  const rewardsInfo = await rewardsUnclaimed(
    chainId,
    rewardsTokenAmount['xGRAIL'].tokenAddress,
    rewardsTokenAmount['xGRAIL'].tokenDecimal,
    holdersRewardToken,
    startEpoch,
    endEpoch,
    startAccumulatedRewards,
    endAccumulatedRewards
  );
  console.table(rewardsInfo);
};
