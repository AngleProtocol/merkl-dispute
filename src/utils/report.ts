import {
  AggregatedRewardsType,
  ALMType,
  AMMAlgorithmMapping,
  AMMType,
  ChainId,
  DistributionCreator__factory,
  Distributor__factory,
  Erc20__factory,
  formatNumber,
  getAmountsForLiquidity,
  getTickAtSqrtRatio,
  Int256,
  MerklAPIData,
  MerklRewardDistributionType,
  merklSubgraphAMMEndpoints,
  MerklSupportedChainIdsType,
  Multicall__factory,
  NFTManagerAddress,
  NonFungiblePositionManagerInterface,
  PoolInterface,
  PoolStateName,
  registry,
  SwapPriceField,
  UnderlyingTreeType,
} from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import JSBI from 'jsbi';

dotenv.config();

import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
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
import { MerklIndexType } from '../providers/merkl-roots/GithubRootsProvider';
import { AccumulatedRewards, PositionType, Price, UserStats } from '../types';
import { getBlockAfterTimestamp } from '.';

export const userParamsCheck = (user: string, pool: string, startTimestamp: number, endTimestamp: number): void => {
  if (!getAddress(user)) throw new Error('Invalid user address');
  if (startTimestamp >= endTimestamp) throw new Error('Invalid timestamps');
  if (!!pool && !getAddress(pool)) throw new Error('Invalid pool address');
};

export const poolParamsCheck = (pool: string, startTimestamp: number, endTimestamp: number): void => {
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

export const statsPoolRewardId = async (chainId: ChainId, pool: string, startEpoch: number, endEpoch: number, prices: Price) => {
  const DistributionCreatorAddress = registry(chainId)?.Merkl?.DistributionCreator;

  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect(MULTICALL_ADDRESS, provider);
  const calls: Multicall3.Call3Struct[] = [];
  const DistributionCreatorInterface = DistributionCreator__factory.createInterface();

  // 0 - Pool generic data
  calls.push({
    allowFailure: true,
    callData: DistributionCreatorInterface.encodeFunctionData('getDistributionsBetweenEpochs', [startEpoch * HOUR, endEpoch * HOUR]),
    target: DistributionCreatorAddress,
  });

  const result = await multicall.callStatic.aggregate3(calls);

  let i = 0;
  const rewards = DistributionCreatorInterface.decodeFunctionResult(
    'getDistributionsBetweenEpochs',
    result[i++]?.returnData
  )?.[0] as ExtensiveDistributionParametersStructOutput[];
  const filteredRewards = rewards.filter((rewards) => rewards.base.uniV3Pool.toLowerCase() === pool.toLowerCase());

  const rewardsTokenAmount = filteredRewards.reduce(
    (curr: { [token: string]: { tokenAddress: string; tokenDecimal: number; amount: number; dollarAmount: number } }, reward) => {
      if (!curr['totalIncentives']) curr['totalIncentives'] = { tokenAddress: '', tokenDecimal: 0, amount: 0, dollarAmount: 0 };
      const normalizer =
        (Math.min(endEpoch, reward.base.epochStart / HOUR + reward.base.numEpoch) - Math.max(startEpoch, reward.base.epochStart / HOUR)) /
        reward.base.numEpoch;
      const amount = BN2Number(reward.base.amount, reward.rewardTokenDecimals) * normalizer;
      const dollarAmount = amount * (prices[reward.rewardTokenSymbol] ?? 0);

      if (!curr[reward.rewardTokenSymbol])
        curr[reward.rewardTokenSymbol] = {
          tokenAddress: reward.base.rewardToken,
          tokenDecimal: reward.rewardTokenDecimals,
          amount: amount,
          dollarAmount: dollarAmount,
        };
      else {
        curr[reward.rewardTokenSymbol].amount += amount;
        curr[reward.rewardTokenSymbol].dollarAmount += dollarAmount;
      }
      curr['totalIncentives'].dollarAmount += dollarAmount;
      return curr;
    },
    {} as { [token: string]: { tokenAddress: string; tokenDecimal: number; amount: number; dollarAmount: number } }
  );

  const distributions =
    !!rewards &&
    rewards.map((reward) => {
      return {
        base: {
          additionalData: reward['base'].additionalData,
          amount: reward['base'].amount,
          boostedReward: reward['base'].boostedReward,
          boostingAddress: reward['base'].boostingAddress,
          epochStart: reward['base'].epochStart,
          isOutOfRangeIncentivized: reward['base'].isOutOfRangeIncentivized,
          numEpoch: reward['base'].numEpoch,
          positionWrappers: reward['base'].positionWrappers,
          propFees: reward['base'].propFees,
          propToken0: reward['base'].propToken0,
          propToken1: reward['base'].propToken1,
          rewardId: reward['base'].rewardId,
          rewardToken: reward['base'].rewardToken,
          uniV3Pool: reward['base'].uniV3Pool,
          wrapperTypes: reward['base'].wrapperTypes,
        },
        poolFee: reward.poolFee,
        rewardTokenDecimals: reward.rewardTokenDecimals,
        rewardTokenSymbol: reward.rewardTokenSymbol,
        token0: {
          add: reward['token0'].add,
          decimals: reward['token0'].decimals,
          poolBalance: reward['token0'].poolBalance,
          symbol: reward['token0'].symbol,
        },
        token1: {
          add: reward['token1'].add,
          decimals: reward['token1'].decimals,
          poolBalance: reward['token1'].poolBalance,
          symbol: reward['token1'].symbol,
        },
      } as ExtensiveDistributionParametersStructOutput;
    });
  const distributionFiltered = distributions.filter((distribution) => distribution.base.uniV3Pool.toLowerCase() === pool.toLowerCase());

  return { rewardsTokenAmount, distributionFiltered, distributions };
};

export const rewardsBreakdownPool = async (
  pool: string,
  startAccumulatedRewards: AggregatedRewardsType,
  endAccumulatedRewards: AggregatedRewardsType
) => {
  /*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                  INTERFACES                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

  const filteredStartAccumulatedRewards = Object.keys(startAccumulatedRewards.rewards)
    .filter((rewardId) => startAccumulatedRewards.rewards[rewardId].pool.toLowerCase() === pool.toLowerCase())
    .reduce((cur, key) => {
      return Object.assign(cur, { [key]: startAccumulatedRewards.rewards[key] });
    }, {} as AggregatedRewardsType['rewards']);

  const filteredEndAccumulatedRewards = Object.keys(endAccumulatedRewards.rewards)
    .filter((rewardId) => endAccumulatedRewards.rewards[rewardId].pool.toLowerCase() === pool.toLowerCase())
    .reduce((cur, key) => {
      return Object.assign(cur, { [key]: endAccumulatedRewards.rewards[key] });
    }, {} as AggregatedRewardsType['rewards']);

  let holders = [];
  const diffRewards = {} as UnderlyingTreeType;
  const rewardsOriginBreakdown = {} as { [origin: string]: number };
  Object.keys(filteredEndAccumulatedRewards).map((rewardId) => {
    diffRewards[rewardId] = {} as MerklRewardDistributionType;
    diffRewards[rewardId].holders = {};
    const decimals = filteredEndAccumulatedRewards[rewardId].tokenDecimals;

    Object.keys(filteredEndAccumulatedRewards[rewardId].holders).map((user) => {
      const newAmount = filteredEndAccumulatedRewards[rewardId]?.holders?.[user]?.amount;
      const oldAmount = filteredStartAccumulatedRewards[rewardId]?.holders?.[user]?.amount;
      const newBreakdown = filteredEndAccumulatedRewards[rewardId]?.holders?.[user]?.breakdown;
      const oldBreakdown = filteredStartAccumulatedRewards[rewardId]?.holders?.[user]?.breakdown;

      if (newAmount !== oldAmount) {
        const userInfo = {
          amount: BN2Number(BigNumber.from(newAmount ?? 0).sub(oldAmount ?? 0), decimals).toString(),
          breakdown: {} as { [origin: string]: number },
          averageBoost: 0,
        };

        for (const reason of Object.keys(newBreakdown)) {
          const earned = Int256.from(BigNumber.from(newBreakdown?.[reason] ?? 0).sub(oldBreakdown?.[reason] ?? 0), decimals).toNumber();
          userInfo.breakdown[reason] = earned;
          if (!rewardsOriginBreakdown[reason]) rewardsOriginBreakdown[reason] = 0;
          rewardsOriginBreakdown[reason] += earned;
        }

        diffRewards[rewardId].holders[user] = userInfo;
      }
    });
    if (Object.keys(diffRewards[rewardId].holders).length === 0) delete diffRewards[rewardId];
    if (diffRewards[rewardId]) holders.push(...Object.keys(diffRewards[rewardId].holders));
  });
  holders = [...new Set(holders)];

  return { diffRewards, rewardsOriginBreakdown, holders };
};

export const rewardsClaimed = async (
  chainId: MerklSupportedChainIdsType,
  pool: string,
  tokenAddress: string,
  tokenDecimals: number,
  holders: string[],
  startEpoch: number,
  endEpoch: number,
  startAccumulatedRewards: AggregatedRewardsType,
  endAccumulatedRewards: AggregatedRewardsType
) => {
  /*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                  INTERFACES                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/
  const distributorAddress = registry(chainId)?.Merkl?.Distributor;

  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect(MULTICALL_ADDRESS, provider);
  const calls: Multicall3.Call3Struct[] = [];
  const DistributorInterface = Distributor__factory.createInterface();

  const startBlockNumber = await getBlockAfterTimestamp(chainId, startEpoch * HOUR);
  const endBlockNumber = await getBlockAfterTimestamp(chainId, endEpoch * HOUR);

  // 1 - Check all on chain claimed rewards for the period
  holders.map((holder) =>
    calls.push({
      allowFailure: true,
      callData: DistributorInterface.encodeFunctionData('claimed', [holder, tokenAddress]),
      target: distributorAddress,
    })
  );

  const claimed = {} as { [holder: string]: number };

  let result = await multicall.callStatic.aggregate3(calls, { blockTag: endBlockNumber });
  holders.map(
    (holder, i) =>
      (claimed[holder] = BN2Number(DistributorInterface.decodeFunctionResult('claimed', result[i]?.returnData)?.[0], tokenDecimals))
  );

  result = await multicall.callStatic.aggregate3(calls, { blockTag: startBlockNumber });
  holders.map(
    (holder, i) =>
      (claimed[holder] -= BN2Number(DistributorInterface.decodeFunctionResult('claimed', result[i]?.returnData)?.[0], tokenDecimals))
  );

  // 2 - Compute total claimable on the token for each users
  const breakdownUserClaimable = {} as {
    [holder: string]: { totalClaimable: { [breakdown: string]: number }; specificClaimable: { [breakdown: string]: number } };
  };
  // First filter them by token reward
  const filteredStartAccumulatedRewards = Object.keys(startAccumulatedRewards.rewards)
    .filter((rewardId) => startAccumulatedRewards.rewards[rewardId].token.toLowerCase() === tokenAddress.toLowerCase())
    .reduce((cur, key) => {
      return Object.assign(cur, { [key]: startAccumulatedRewards.rewards[key] });
    }, {} as AggregatedRewardsType['rewards']);

  const filteredEndAccumulatedRewards = Object.keys(endAccumulatedRewards.rewards)
    .filter((rewardId) => endAccumulatedRewards.rewards[rewardId].token.toLowerCase() === tokenAddress.toLowerCase())
    .reduce((cur, key) => {
      return Object.assign(cur, { [key]: endAccumulatedRewards.rewards[key] });
    }, {} as AggregatedRewardsType['rewards']);

  Object.keys(filteredEndAccumulatedRewards).map((rewardId) => {
    const rewardPool = filteredEndAccumulatedRewards[rewardId].pool;
    const decimals = filteredEndAccumulatedRewards[rewardId].tokenDecimals;
    Object.keys(filteredEndAccumulatedRewards[rewardId].holders).map((user) => {
      if (holders.includes(user)) {
        const newAmount = filteredEndAccumulatedRewards[rewardId]?.holders?.[user]?.amount;
        const oldAmount = filteredStartAccumulatedRewards[rewardId]?.holders?.[user]?.amount;
        const newBreakdown = filteredEndAccumulatedRewards[rewardId]?.holders?.[user]?.breakdown;
        const oldBreakdown = filteredStartAccumulatedRewards[rewardId]?.holders?.[user]?.breakdown;

        if (newAmount !== oldAmount) {
          if (!breakdownUserClaimable[user]) breakdownUserClaimable[user] = { totalClaimable: {}, specificClaimable: {} };
          const totalEarned = BN2Number(BigNumber.from(newAmount ?? 0).sub(oldAmount ?? 0), decimals);
          if (!breakdownUserClaimable[user].totalClaimable['Total']) breakdownUserClaimable[user].totalClaimable['Total'] = 0;
          breakdownUserClaimable[user].totalClaimable['Total'] += totalEarned;

          if (pool.toLowerCase() === rewardPool.toLowerCase()) {
            if (!breakdownUserClaimable[user].specificClaimable['Total']) breakdownUserClaimable[user].specificClaimable['Total'] = 0;
            breakdownUserClaimable[user].specificClaimable['Total'] += totalEarned;
          }

          for (const reason of Object.keys(newBreakdown)) {
            const earned = Int256.from(BigNumber.from(newBreakdown?.[reason] ?? 0).sub(oldBreakdown?.[reason] ?? 0), decimals).toNumber();
            if (!breakdownUserClaimable[user].totalClaimable[reason]) breakdownUserClaimable[user].totalClaimable[reason] = 0;
            breakdownUserClaimable[user].totalClaimable[reason] += earned;
            if (pool.toLowerCase() === rewardPool.toLowerCase()) {
              if (!breakdownUserClaimable[user].specificClaimable[reason]) breakdownUserClaimable[user].specificClaimable[reason] = 0;
              breakdownUserClaimable[user].specificClaimable[reason] += earned;
            }
          }
        }
      }
    });
  });

  // 3 Compute proportionnaly what the users have claimed
  const breakdownUserClaimed = {} as {
    [holder: string]: { [breakdown: string]: string };
  };

  Object.keys(breakdownUserClaimable).map((user) => {
    breakdownUserClaimed[user] = {};
    for (const origin of Object.keys(breakdownUserClaimable[user].totalClaimable)) {
      const percentClaimed = breakdownUserClaimable[user].specificClaimable[origin] / breakdownUserClaimable[user].totalClaimable[origin];
      breakdownUserClaimed[user][origin] =
        breakdownUserClaimable[user].totalClaimable[origin] == 0 ? `${0}` : `${percentClaimed * claimed[user]} (${percentClaimed * 100} %)`;
    }
  });

  return breakdownUserClaimed;
};
