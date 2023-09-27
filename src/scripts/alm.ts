import { ALMType, AMMType, ChainId, Int256, MerklAPIData } from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import { BigNumber, BigNumberish, utils } from 'ethers';

dotenv.config();
import console from 'console';
import { getAddress } from 'ethers/lib/utils';
import moment from 'moment';

import { HOUR } from '../constants';
import { MerklIndexType } from '../routes';
import { AccumulatedRewards, UserStats } from '../types';
import { linespace } from '../utils/merkl';
import { aggregatedStats, almCheck, fetchReportData, fetchRewardJson, paramsCheck, poolName, statsUserPool } from '../utils/report';
/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                 MAIN FUNCTION                                                  
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/
async function getALMChainRewards(
  chainId: ChainId,
  almAddress: string,
  almType: ALMType,
  startTimestamp: number,
  endTimestamp: number,
  merklIndex: MerklIndexType,
  merklAPIData: MerklAPIData,
  log = true
): Promise<{ startEpoch: number; endEpoch: number; accumulatedRewards: AccumulatedRewards[]; accumulatedTokens: string[] }> {
  const ALMname = ALMType[almType];

  const { startEpoch, endEpoch, startTree, endTree } = await fetchRewardJson(chainId, merklIndex, startTimestamp, endTimestamp);

  const accumulatedRewards: AccumulatedRewards[] = [];
  const accumulatedTokens = [];

  if (log)
    console.log(
      `Analyzing rewards earned by ${ALMname}-${almAddress} on Merkl over ${endEpoch - startEpoch} hours from ${moment
        .unix(startEpoch * HOUR)
        .format('ddd DD MMM YYYY HH:00')} to ${moment.unix(endEpoch * HOUR).format('ddd DD MMM YYYY HH:00')} `
    );

  for (const k of Object.keys(endTree.rewards)) {
    const pool = endTree?.rewards?.[k]?.pool;
    const poolApiData = merklAPIData?.pools?.[getAddress(pool)];
    // Sometimes api fails to return the pool data
    if (!poolApiData) continue;
    const symbol = endTree?.rewards?.[k].tokenSymbol;
    const decimals = endTree?.rewards?.[k].tokenDecimals;
    const name = poolName(poolApiData);
    const amm = endTree?.rewards?.[k]?.amm;
    const origin = AMMType[poolApiData?.amm];

    const holders = Object.keys(endTree?.rewards?.[k]?.holders);
    const rewards = holders.reduce((res, user) => {
      const newAmount = endTree?.rewards?.[k]?.holders?.[user]?.amount;
      const oldAmount = startTree?.rewards?.[k]?.holders?.[user]?.amount;
      const newBreakdown = endTree?.rewards?.[k]?.holders?.[user]?.breakdown;
      const oldBreakdown = startTree?.rewards?.[k]?.holders?.[user]?.breakdown;

      if (newAmount !== oldAmount && Object.keys(newBreakdown).includes(ALMname)) {
        const earned = Int256.from(BigNumber.from(newBreakdown?.[ALMname] ?? 0).sub(oldBreakdown?.[ALMname] ?? 0), decimals).toNumber();

        if (res.Earned) res.Earned += earned;
        else res.Earned = earned;
        res.Token = symbol;
        res.Origin = origin;
        res.PoolName = name;
        res.Amm = amm;
        res.Distribution = k;
        res.PoolAddress = pool;
      }
      return res;
    }, {} as AccumulatedRewards);
    if (rewards.Earned > 0) {
      accumulatedRewards.push(rewards);
      if (!accumulatedTokens.includes(rewards.Token)) accumulatedTokens.push(rewards.Token);
    }
  }

  return { startEpoch, endEpoch, accumulatedRewards, accumulatedTokens };
}

// TODO let's do historical ALM APR for the global chain and for a specific pool
// Timestamps will be rounded to the previous reward computation epoch
export const reportGlobalChainAlm = async (
  chainId: ChainId,
  almType: ALMType,
  startTimestamp: number,
  endTimestamp: number
): Promise<void> => {
  if (startTimestamp >= endTimestamp) throw new Error('Invalid timestamps');
  /** 1 - Fetch useful data */
  const { merklIndex, merklAPIData } = await fetchReportData(chainId);

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const { accumulatedRewards, accumulatedTokens } = await getALMChainRewards(
    chainId,
    '',
    almType,
    startTimestamp,
    endTimestamp,
    merklIndex,
    merklAPIData
  );

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
};

export const reportPoolAlm = async (
  chainId: ChainId,
  almAddress: string,
  almType: ALMType,
  startTimestamp: number,
  endTimestamp: number,
  pool: string
): Promise<void> => {
  paramsCheck(almAddress, pool, startTimestamp, endTimestamp);
  /** 1 - Fetch useful data */
  const { prices, merklIndex, merklAPIData } = await fetchReportData(chainId);
  almCheck(merklAPIData, pool, almAddress, almType);
  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const { startEpoch, endEpoch, accumulatedRewards } = await getALMChainRewards(
    chainId,
    almAddress,
    almType,
    startTimestamp,
    endTimestamp,
    merklIndex,
    merklAPIData
  );

  const { startStat, endStat } = await statsUserPool(
    chainId,
    almAddress,
    pool,
    startEpoch,
    endEpoch,
    accumulatedRewards,
    merklAPIData,
    prices,
    false
  );

  console.log("Aggregated stats for the user's pool: \n", aggregatedStats(startStat.concat(endStat)));
};

export const reportHistoricalPoolAPRAlm = async (
  chainId: ChainId,
  almAddress: string,
  almType: ALMType,
  startTimestamp: number,
  endTimestamp: number,
  steps: number,
  pool?: string
): Promise<void> => {
  paramsCheck(almAddress, pool, startTimestamp, endTimestamp);
  /** 1 - Fetch useful data */
  const { prices, merklIndex, merklAPIData } = await fetchReportData(chainId);
  almCheck(merklAPIData, pool, almAddress, almType);

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const timestampArray = linespace(startTimestamp, endTimestamp, steps);
  let aggStats: UserStats[] = [];
  for (let index = 0; index < timestampArray.length - 1; index++) {
    const { startEpoch, endEpoch, accumulatedRewards } = await getALMChainRewards(
      chainId,
      almAddress,
      almType,
      timestampArray[index],
      timestampArray[index + 1],
      merklIndex,
      merklAPIData,
      false
    );

    const { startStat, endStat } = await statsUserPool(
      chainId,
      almAddress,
      pool,
      startEpoch,
      endEpoch,
      accumulatedRewards,
      merklAPIData,
      prices,
      false,
      true
    );

    aggStats = aggStats.concat(startStat.concat(endStat));
  }

  console.log("Aggregated start stats for the user's pool: \n", aggregatedStats(aggStats));
};
