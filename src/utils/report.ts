import { AggregatedRewardsType, AMMType, ChainId, MerklAPIData } from '@angleprotocol/sdk';
import dotenv from 'dotenv';

dotenv.config();

import axios from 'axios';
import { getAddress } from 'ethers/lib/utils';

import { ANGLE_API, GITHUB_URL, HOUR } from '../constants';
import { MerklIndexType } from '../routes';
import { Price } from '../types';

export const paramsCheck = (user: string, pool: string, startTimestamp: number, endTimestamp: number): void => {
  if (!getAddress(user)) throw new Error('Invalid user address');
  if (startTimestamp >= endTimestamp) throw new Error('Invalid timestamps');
  if (!!pool && !getAddress(pool)) throw new Error('Invalid pool address');
};

export const roundDownWhileKeyNotFound = (merklIndex: MerklIndexType, timestamp: number): number => {
  let epoch = Math.floor(timestamp / HOUR);
  while (!Object.values(merklIndex).includes(epoch)) {
    epoch -= 1;
  }
  return epoch;
};

export const fetchTree = async (chainId: number, epoch: number): Promise<AggregatedRewardsType> => {
  return (
    await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${epoch}.json`}`, {
      timeout: 5000,
    })
  ).data;
};

export const poolName = (poolApiData: MerklAPIData['pools'][string]): string => {
  return `${AMMType[poolApiData.amm]} ${poolApiData.tokenSymbol0}-${poolApiData.tokenSymbol1} ${poolApiData.poolFee + '%' ?? ``}`;
};

export const fetchReportData = async (
  chainId: number
): Promise<{ prices: Price; merklIndex: MerklIndexType; merklAPIData: MerklAPIData }> => {
  const promises = [];

  const prices = {};
  console.log(ANGLE_API + `v1/prices`);
  promises.push(
    axios.get<{ rate: number; token: string }[]>(ANGLE_API + `v1/prices`).then((res) => {
      res.data.forEach((p) => (prices[p.token] = p.rate));
    })
  );

  let merklIndex: MerklIndexType;
  promises.push(
    axios
      .get<MerklIndexType>(GITHUB_URL + `${chainId + `/index.json`}`, {
        timeout: 5000,
      })
      .then((res) => {
        merklIndex = res.data;
      })
  );

  let merklAPIData: MerklAPIData;
  promises.push(
    axios
      .get<MerklAPIData>(ANGLE_API + `v1/merkl`, {
        timeout: 5000,
      })
      .then((res) => {
        merklAPIData = res.data;
      })
  );
  try {
    await Promise.all(promises);
  } catch (e) {
    console.log(e);
  }

  return { prices, merklIndex, merklAPIData };
};

export const fetchRewardJson = async (
  chainId: ChainId,
  merklIndex: MerklIndexType,
  startTimestamp: number,
  endTimestamp: number
): Promise<{ startEpoch: number; endEpoch: number; startTree: AggregatedRewardsType; endTree: AggregatedRewardsType }> => {
  const startEpoch = roundDownWhileKeyNotFound(merklIndex, startTimestamp);
  const endEpoch = roundDownWhileKeyNotFound(merklIndex, endTimestamp);
  let startTree: AggregatedRewardsType, endTree: AggregatedRewardsType;
  await Promise.all([
    fetchTree(chainId, startEpoch).then((res) => (startTree = res)),
    fetchTree(chainId, endEpoch).then((res) => (endTree = res)),
  ]);
  return { startEpoch, endEpoch, startTree, endTree };
};
