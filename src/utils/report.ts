import {
  AggregatedRewardsType,
  ALMType,
  AMMAlgorithmMapping,
  AMMAlgorithmType,
  AMMType,
  ChainId,
  Erc20__factory,
  formatNumber,
  getAmountsForLiquidity,
  getTickAtSqrtRatio,
  Int256,
  MerklAPIData,
  merklSubgraphAMMEndpoints,
  Multicall__factory,
  NFTManagerAddress,
  NonFungiblePositionManagerInterface,
  PoolInterface,
  PoolStateName,
  SwapPriceField,
} from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import JSBI from 'jsbi';

dotenv.config();

import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import { BN2Number } from '@angleprotocol/sdk/dist/utils';
import axios from 'axios';
import { BigNumber, BigNumberish, utils } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import request from 'graphql-request';

import { ANGLE_API, GITHUB_URL, HOUR, MULTICALL_ADDRESS, YEAR } from '../constants';
import { round } from '../helpers';
import { positionsQuery } from '../helpers/queries';
import { httpProvider } from '../providers';
import { MerklIndexType } from '../routes';
import { AccumulatedRewards, PositionType, Price, UserStats } from '../types';
import { getBlockAfterTimestamp } from '.';

export const paramsCheck = (user: string, pool: string, startTimestamp: number, endTimestamp: number): void => {
  if (!getAddress(user)) throw new Error('Invalid user address');
  if (startTimestamp >= endTimestamp) throw new Error('Invalid timestamps');
  if (!!pool && !getAddress(pool)) throw new Error('Invalid pool address');
};

export const almCheck = (merklAPIData: MerklAPIData, pool: string, almAddress: string, almType: ALMType): void => {
  const ALMname = ALMType[almType];
  const poolApiData = merklAPIData?.pools?.[getAddress(pool)];
  // Check that the almAddress is really linked to this pool
  const filteredALM = poolApiData.almDetails.filter((alm) => alm.address === almAddress.toLowerCase());

  // this would be problematic as we would not be able to distinguish between the two vaults APRs
  if (filteredALM.length > 1) throw new Error(`Multiple ${ALMname} for ${getAddress(pool)}`);
  if (filteredALM.length === 0 || Number(filteredALM[0].origin) !== almType) throw new Error('Invalid ALM address');
};
export const roundDownWhileKeyNotFound = (merklIndex: MerklIndexType, timestamp: number): number => {
  let epoch = Math.floor(timestamp / HOUR);
  while (!Object.values(merklIndex).includes(epoch)) {
    epoch -= 1;
  }
  return epoch;
};

export const fetchAccumulatedRewards = async (chainId: number, epoch: number): Promise<AggregatedRewardsType> => {
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

  await Promise.all(promises);

  return { prices, merklIndex, merklAPIData };
};

export const fetchRewardJson = async (
  chainId: ChainId,
  merklIndex: MerklIndexType,
  startTimestamp: number,
  endTimestamp: number
): Promise<{
  startEpoch: number;
  endEpoch: number;
  startAccumulatedRewards: AggregatedRewardsType;
  endAccumulatedRewards: AggregatedRewardsType;
}> => {
  const startEpoch = roundDownWhileKeyNotFound(merklIndex, startTimestamp);
  const endEpoch = roundDownWhileKeyNotFound(merklIndex, endTimestamp);
  let startAccumulatedRewards: AggregatedRewardsType, endAccumulatedRewards: AggregatedRewardsType;
  await Promise.all([
    fetchAccumulatedRewards(chainId, startEpoch).then((res) => (startAccumulatedRewards = res)),
    fetchAccumulatedRewards(chainId, endEpoch).then((res) => (endAccumulatedRewards = res)),
  ]);
  return { startEpoch, endEpoch, startAccumulatedRewards, endAccumulatedRewards };
};

export const statsUserPool = async (
  chainId: ChainId,
  user: string,
  pool: string,
  startEpoch: number,
  endEpoch: number,
  accumulatedRewards: AccumulatedRewards[],
  merklAPIData: MerklAPIData,
  prices: Price,
  countALM: boolean,
  log = true
): Promise<{ startStat: UserStats[]; endStat: UserStats[] }> => {
  const merklAPIPoolData = merklAPIData?.pools?.[getAddress(pool)];
  const poolRewards = accumulatedRewards.filter((a) => getAddress(a.PoolAddress) === getAddress(pool));
  /*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                  INTERFACES                                                    
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/
  const amm = merklAPIPoolData.amm;
  const ammAlgo = AMMAlgorithmMapping[amm];

  const Erc20Interface = Erc20__factory.createInterface();
  const poolInterface = PoolInterface(ammAlgo);
  const nftManagerInterface = NonFungiblePositionManagerInterface(ammAlgo);
  const poolStateName = PoolStateName[ammAlgo];
  const swapPriceField = SwapPriceField[ammAlgo];
  const periodReward = poolRewards.reduce((prev, curr) => prev + curr.Earned * prices[curr.Token], 0);

  if (log) {
    console.log('\n//////////////////////////////////////////////////////////////////////////////////////////////////////////////////\n');
    console.log(`Now, let's break down rewards for the pool ${poolName(merklAPIPoolData)} (${pool}): \n`);
    console.log(`Over the period of interest this address earned the following: \n`);
    console.table(poolRewards, ['Earned', 'Token', 'Origin']);
    console.log(
      `At current prices, this is worth ~$${formatNumber(periodReward)}, which would make ~$${formatNumber(
        (periodReward * YEAR) / (endEpoch * HOUR - startEpoch * HOUR)
      )} over a year. \n`
    );
  }

  const alms = merklAPIPoolData.almDetails;
  const token0 = merklAPIPoolData.token0;
  const token0Decimals = merklAPIPoolData.decimalToken0;
  const token0Symbol = merklAPIPoolData.tokenSymbol0;
  const token1 = merklAPIPoolData.token1;
  const token1Decimals = merklAPIPoolData.decimalToken1;
  const token1Symbol = merklAPIPoolData.tokenSymbol1;
  const owners = countALM ? [user?.toLowerCase()].concat(alms.map((a) => a.address.toLowerCase())) : [user?.toLowerCase()];

  const result = await request<
    {
      nft: PositionType[];
      nftPast: PositionType[];
      direct: PositionType[];
      directPast: PositionType[];
    },
    any
  >(merklSubgraphAMMEndpoints('prod')[chainId][amm], positionsQuery, {
    owners: owners,
    pool: pool?.toLowerCase(),
    timestamp: startEpoch * HOUR,
  });

  const directPositions = result.direct.concat(result.directPast);
  const nftPositions = result.nft.concat(result.nftPast);

  const startBlockNumber = await getBlockAfterTimestamp(chainId, startEpoch * HOUR);
  const endBlockNumber = await getBlockAfterTimestamp(chainId, endEpoch * HOUR);

  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect(MULTICALL_ADDRESS, provider);
  const calls: Multicall3.Call3Struct[] = [];

  // 0 - Pool generic data
  calls.push(
    {
      allowFailure: true,
      callData: poolInterface.encodeFunctionData(poolStateName),
      target: pool,
    },
    {
      allowFailure: true,
      callData: poolInterface.encodeFunctionData('liquidity'),
      target: pool,
    },
    {
      allowFailure: true,
      callData: Erc20Interface.encodeFunctionData('balanceOf', [pool]),
      target: token0,
    },
    {
      allowFailure: true,
      callData: Erc20Interface.encodeFunctionData('balanceOf', [pool]),
      target: token1,
    }
  );

  // 1 - User direct positions
  for (const pos of directPositions.filter((p) => p.owner === user.toLowerCase())) {
    calls.push({
      allowFailure: true,
      callData: poolInterface.encodeFunctionData('positions', [
        utils.solidityKeccak256(['address', 'int24', 'int24'], [pos.owner, pos.tickLower, pos.tickUpper]),
      ]),
      target: pool,
    });
  }

  // 2 - User NFT positions
  for (const pos of nftPositions.filter((p) => p.owner === user.toLowerCase())) {
    calls.push({
      allowFailure: true,
      callData: nftManagerInterface.encodeFunctionData('positions', [pos.id]),
      target: NFTManagerAddress[chainId][amm],
    });
  }

  if (countALM) {
    // ALM data
    for (const alm of alms) {
      // 3 - ALM NFT positions
      for (const pos of directPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
        calls.push({
          allowFailure: true,
          callData: poolInterface.encodeFunctionData('positions', [
            utils.solidityKeccak256(['address', 'int24', 'int24'], [pos.owner, pos.tickLower, pos.tickUpper]),
          ]),
          target: pool,
        });
      }

      // 4 - ALM NFT positions
      for (const pos of nftPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
        calls.push({
          allowFailure: true,
          callData: nftManagerInterface.encodeFunctionData('positions', [pos.id]),
          target: pool,
        });
      }

      // 5 - Balance / Total Supply
      calls.push(
        {
          allowFailure: true,
          callData: Erc20Interface.encodeFunctionData('totalSupply'),
          target: alm.address,
        },
        {
          allowFailure: true,
          callData: Erc20Interface.encodeFunctionData('balanceOf', [user]),
          target: alm.address,
        }
      );
    }
  }

  const analyzePoolState = async (blockNumber: number, log = true) => {
    const stats = [] as UserStats[];

    const res = await multicall.callStatic.aggregate3(calls, { blockTag: blockNumber });
    let i = 0;
    const sqrtPriceX96 = poolInterface.decodeFunctionResult(poolStateName, res[i++]?.returnData)[swapPriceField]?.toString();
    const liquidityInPool = poolInterface.decodeFunctionResult('liquidity', res[i++]?.returnData)[0]?.toString();
    const amount0InPool = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', res[i++]?.returnData)[0], token0Decimals);
    const amount1InPool = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', res[i++]?.returnData)[0], token1Decimals);
    const tvlInPool = amount0InPool * prices[token0Symbol] + amount1InPool * prices[token1Symbol];

    const tick = getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96));
    const addPositionInArray = (pos: PositionType, type: string, liquidity: BigNumberish) => {
      const [amount0, amount1] = getAmountsForLiquidity(
        sqrtPriceX96,
        Number(pos.tickLower),
        Number(pos.tickUpper),
        BigNumber.from(liquidity)
      );
      const inRange = Number(pos.tickLower) <= tick && tick < Number(pos.tickUpper);

      const tvl = BN2Number(amount0, token0Decimals) * prices[token0Symbol] + BN2Number(amount1, token1Decimals) * prices[token1Symbol];
      const positionRewards =
        poolRewards.filter((p) => p.Origin === type)?.reduce((prev, curr) => prev + curr.Earned * prices[curr.Token], 0) ?? 0;

      if (BN2Number(amount0, token0Decimals) > 0 || BN2Number(amount1, token1Decimals) > 0) {
        stats.push({
          lowerTick: pos.tickLower,
          tick,
          upperTick: pos.tickUpper,
          type,
          amount0: BN2Number(amount0, token0Decimals),
          amount1: BN2Number(amount1, token1Decimals),
          liquidity: liquidity?.toString(),
          inRange,
          tvl,
          earned: positionRewards,
          propFee: inRange ? round(Int256.from(liquidity, 0).mul(10000).div(liquidityInPool).toNumber() / 100, 2) : 0,
          propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / amount0InPool) * 100, 2) : 0,
          propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / amount1InPool) * 100, 2) : 0,
          inducedAPR: round(((positionRewards * YEAR) / (endEpoch * HOUR - startEpoch * HOUR) / tvl) * 100, 3),
        });
      }
    };

    for (const pos of directPositions.filter((p) => p.owner === user.toLowerCase())) {
      try {
        const position = poolInterface.decodeFunctionResult('positions', res[i]?.returnData);
        addPositionInArray(pos, AMMType[amm], position.liquidity);
      } catch (e) {
        console.error(e);
      }
      i++;
    }

    for (const pos of nftPositions.filter((p) => p.owner === user.toLowerCase())) {
      try {
        const position = nftManagerInterface.decodeFunctionResult('positions', res[i]?.returnData);
        addPositionInArray(pos, AMMType[amm], position.liquidity);
      } catch (e) {
        console.error(e);
      }
      i++;
    }

    if (countALM) {
      for (const alm of alms) {
        try {
          let j = i;
          let amount0InAlm = 0;
          let amount1InAlm = 0;
          let liquidityInAlm = BigNumber.from(0);

          for (const pos of directPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
            const position = poolInterface.decodeFunctionResult('positions', res[j++]?.returnData);
            const [aux0, aux1] = getAmountsForLiquidity(
              sqrtPriceX96,
              Number(pos.tickLower),
              Number(pos.tickUpper),
              BigNumber.from(position.liquidity)
            );
            const inRange = Number(pos.tickLower) <= tick && tick < Number(pos.tickUpper);

            amount0InAlm += BN2Number(aux0, token0Decimals);
            amount1InAlm += BN2Number(aux1, token1Decimals);
            if (inRange) liquidityInAlm = liquidityInAlm.add(position.liquidity);
          }

          // 4 - ALM NFT positions
          for (const pos of nftPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
            const position = nftManagerInterface.decodeFunctionResult('positions', res[j++]?.returnData);
            const [aux0, aux1] = getAmountsForLiquidity(
              sqrtPriceX96,
              Number(pos.tickLower),
              Number(pos.tickUpper),
              BigNumber.from(position.liquidity)
            );
            const inRange = Number(pos.tickLower) <= tick && tick < Number(pos.tickUpper);

            amount0InAlm += BN2Number(aux0, token0Decimals);
            amount1InAlm += BN2Number(aux1, token1Decimals);
            if (inRange) liquidityInAlm = liquidityInAlm.add(position.liquidity);
          }

          // 5 - Balance / Total Supply
          const supply = BN2Number(Erc20Interface.decodeFunctionResult('totalSupply', res[j++]?.returnData)[0]);
          const balance = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', res[j++]?.returnData)[0]);
          const proportion = balance / supply;

          const userAmount0InAlm = proportion * amount0InAlm;
          const userAmount1InAlm = proportion * amount1InAlm;

          const type = ALMType[alm.origin];
          const tvl = userAmount0InAlm * prices[token0Symbol] + userAmount1InAlm * prices[token1Symbol];
          const positionRewards =
            poolRewards.filter((p) => p.Origin === type)?.reduce((prev, curr) => prev + curr.Earned * prices[curr.Token], 0) ?? 0;

          if (userAmount0InAlm !== 0 || userAmount1InAlm !== 0) {
            stats.push({
              type,
              amount0: userAmount0InAlm,
              amount1: userAmount1InAlm,
              liquidity: liquidityInAlm
                .mul(Math.round(proportion * 1e8))
                .div(1e8)
                .toString(),
              tvl,
              earned: positionRewards,
              propFee: round((proportion * Int256.from(liquidityInAlm, 0).mul(10000).div(liquidityInPool).toNumber()) / 100, 2),
              propAmount0: round((userAmount0InAlm / amount0InPool) * 100, 2),
              propAmount1: round((userAmount1InAlm / amount1InPool) * 100, 2),
              inducedAPR: round(((positionRewards * YEAR) / (endEpoch * HOUR - startEpoch * HOUR) / tvl) * 100, 3),
            });
          }
        } catch (e) {
          // console.error(e);
        }
        i =
          i +
          directPositions.filter((p) => p.owner === alm.address.toLowerCase())?.length +
          nftPositions.filter((p) => p.owner === alm.address.toLowerCase())?.length +
          2;
      }
    }

    if (log) {
      console.log(`The TVL of the pool at block ${blockNumber} based on current prices was $${tvlInPool}`);
      console.table(stats);
    }
    return stats;
  };
  if (log) console.log(`\nState of the pool at the beginning of the period (block ${startBlockNumber}): \n`);
  const startStat = await analyzePoolState(startBlockNumber, log);

  if (log) console.log(`\nState of the pool at the end of the period (block ${endBlockNumber}): \n`);
  const endStat = await analyzePoolState(endBlockNumber, log);

  return { startStat, endStat };
};

export function aggregatedStats(stats: UserStats[]): number {
  const aggregatedStats = stats.reduce(
    (curr: { tvl: number; normalisedEarned: number }, stat) => {
      curr.tvl += stat.tvl;
      curr.normalisedEarned += (stat.inducedAPR * stat.tvl) / 100;
      return curr;
    },
    { tvl: 0, normalisedEarned: 0 }
  );
  return round((aggregatedStats.normalisedEarned / aggregatedStats.tvl) * 100, 3);
}
