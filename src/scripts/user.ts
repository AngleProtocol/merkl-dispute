import { ChainId, Int256 } from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import { BigNumber } from 'ethers';

dotenv.config();

import console from 'console';
import { getAddress } from 'ethers/lib/utils';
import moment from 'moment';

import { HOUR } from '../constants';
import { AccumulatedRewards } from '../types';
import { fetchReportData, fetchRewardJson, paramsCheck, poolName, statsUserPool } from '../utils/report';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                 MAIN FUNCTION                                                  
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

// Timestamps will be rounded to the previous reward computation epoch
export const reportUser = async (
  chainId: ChainId,
  user: string,
  startTimestamp: number,
  endTimestamp: number,
  pool?: string
): Promise<void> => {
  paramsCheck(user, pool, startTimestamp, endTimestamp);
  /** 1 - Fetch useful data */
  const { prices, merklIndex, merklAPIData } = await fetchReportData(chainId);

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const { startEpoch, endEpoch, startTree, endTree } = await fetchRewardJson(chainId, merklIndex, startTimestamp, endTimestamp);

  const accumulatedRewards: AccumulatedRewards[] = [];

  console.log(
    `Analyzing rewards earned by ${user} on Merkl over ${endEpoch - startEpoch} hours from ${moment
      .unix(startEpoch * HOUR)
      .format('ddd DD MMM YYYY HH:00')} to ${moment.unix(endEpoch * HOUR).format('ddd DD MMM YYYY HH:00')} `
  );
  const accumulatedTokens = [];

  for (const k of Object.keys(endTree.rewards)) {
    const newAmount = endTree?.rewards?.[k]?.holders?.[user]?.amount;
    const oldAmount = startTree?.rewards?.[k]?.holders?.[user]?.amount;
    const newBreakdown = endTree?.rewards?.[k]?.holders?.[user]?.breakdown;
    const oldBreakdown = startTree?.rewards?.[k]?.holders?.[user]?.breakdown;

    if (newAmount !== oldAmount) {
      for (const reason of Object.keys(newBreakdown)) {
        const symbol = endTree?.rewards?.[k].tokenSymbol;
        if (!accumulatedTokens.includes(symbol)) {
          accumulatedTokens.push(symbol);
        }
        const decimals = endTree?.rewards?.[k].tokenDecimals;
        const pool = endTree?.rewards?.[k]?.pool;
        const earned = Int256.from(BigNumber.from(newBreakdown?.[reason] ?? 0).sub(oldBreakdown?.[reason] ?? 0), decimals).toNumber();

        const poolApiData = merklAPIData?.pools?.[getAddress(pool)];

        accumulatedRewards.push({
          Earned: earned,
          Token: symbol,
          Origin: reason,
          PoolName: poolName(poolApiData),
          Amm: endTree?.rewards?.[k]?.amm,
          Distribution: k,
          PoolAddress: pool,
        });
      }
    }
  }
  console.log(`\nThe following rewards where accumulated: \n`);

  console.table(accumulatedRewards, ['Earned', 'Token', 'PoolName', 'Origin', 'PoolAddress']);

  console.log(`\nAggregated per token, this gives: \n`);

  console.table(
    accumulatedTokens.map((symbol) =>
      accumulatedRewards
        .filter((a) => a.Token === symbol)
        .reduce(
          (prev, curr) => {
            return { Earned: prev.Earned + curr.Earned, Token: symbol };
          },
          { Earned: 0, Token: symbol }
        )
    ),
    ['Earned', 'Token']
  );

  if (!!pool) {
    const { startStat, endStat } = await statsUserPool(
      chainId,
      user,
      pool,
      startEpoch,
      endEpoch,
      accumulatedRewards,
      merklAPIData,
      prices,
      true
    );
  }
};
