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
  poolName,
  poolParamsCheck,
  rewardsBreakdownPool,
  rewardsClaimed,
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

  const { distributions, distributionFiltered, rewardsTokenAmount } = await statsPoolRewardId(chainId, pool, startEpoch, endEpoch, prices);
  console.table(rewardsTokenAmount);
  console.table(distributionFiltered);

  const { diffRewards, rewardsOriginBreakdown, holders } = await rewardsBreakdownPool(pool, startAccumulatedRewards, endAccumulatedRewards);
  console.table(diffRewards);
  console.table(rewardsOriginBreakdown);

  const tokenName = Object.keys(rewardsTokenAmount)[1];
  //   const breakdownUserClaimed = rewardsClaimed(
  //     chainId,
  //     pool,
  //     rewardsTokenAmount[tokenName].tokenAddress,
  //     rewardsTokenAmount[tokenName].tokenDecimal,
  //     holders,
  //     startEpoch * HOUR,
  //     endEpoch * HOUR,
  //     startAccumulatedRewards,
  //     endAccumulatedRewards
  //   );
  //   console.table(breakdownUserClaimed);
  Object.keys(rewardsTokenAmount).map((token, i) => {
    if (i === 0) return;
    const breakdownUserClaimed = rewardsClaimed(
      chainId,
      pool,
      rewardsTokenAmount[token].tokenAddress,
      rewardsTokenAmount[token].tokenDecimal,
      holders,
      startEpoch * HOUR,
      endEpoch * HOUR,
      startAccumulatedRewards,
      endAccumulatedRewards
    );
    console.table(breakdownUserClaimed);
  });
};
