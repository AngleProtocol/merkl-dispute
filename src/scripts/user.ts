import {
  AggregatedRewardsType,
  ALMType,
  AMMAlgorithmMapping,
  AMMAlgorithmType,
  AMMType,
  ChainId,
  Erc20__factory,
  formatNumber,
  getTickAtSqrtRatio,
  Int256,
  MerklAPIData,
  merklSubgraphAMMEndpoints,
  Multicall__factory,
  NFTManagerAddress,
  UniswapV3NFTManager__factory,
  UniswapV3Pool__factory,
} from '@angleprotocol/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber, BigNumberish, utils } from 'ethers';

dotenv.config();

import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import { BN2Number } from '@angleprotocol/sdk/dist/utils';
import console from 'console';
import { getAddress } from 'ethers/lib/utils';
import request, { gql } from 'graphql-request';
import JSBI from 'jsbi';
import moment from 'moment';

import { ANGLE_API, GITHUB_URL, HOUR, YEAR } from '../constants';
import { round } from '../helpers';
import { httpProvider } from '../providers';
import { MerklIndexType } from '../routes';
import { PositionType } from '../types';
import { getBlockAfterTimestamp } from '../utils';
import { getAmountsForLiquidity } from '../utils/uniV3';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                   REQUESTS                                                     
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const positionsQuery = gql`
  query Positions($owners: [String!], $timestamp: Int!, $pool: String!) {
    nft: nftpositions(where: { owner_in: $owners, pool: $pool, endTimestamp: 0 }) {
      id
      pool {
        id
      }
      startTimestamp
      endTimestamp
      tickLower
      tickUpper
      liquidity
      owner
    }
    nftPast: nftpositions(where: { owner_in: $owners, pool: $pool, endTimestamp_gt: $timestamp }) {
      id
      pool {
        id
      }
      startTimestamp
      endTimestamp
      tickLower
      tickUpper
      liquidity
      owner
    }
    direct: directPositions(where: { owner_in: $owners, pool: $pool, endTimestamp: 0 }) {
      id
      pool {
        id
      }
      startTimestamp
      endTimestamp
      tickLower
      tickUpper
      liquidity
      owner
    }
    directPast: directPositions(where: { owner_in: $owners, pool: $pool, endTimestamp_gt: $timestamp }) {
      id
      pool {
        id
      }
      startTimestamp
      endTimestamp
      tickLower
      tickUpper
      liquidity
      owner
    }
  }
`;

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                  INTERFACES                                                    
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const poolInterface = UniswapV3Pool__factory.createInterface();
const nftManagerInterface = UniswapV3NFTManager__factory.createInterface();
const Erc20Interface = Erc20__factory.createInterface();

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
  if (!getAddress(user)) throw new Error('Invalid user address');
  if (startTimestamp >= endTimestamp) throw new Error('Invalid timestamps');
  if (!!pool && !getAddress(pool)) throw new Error('Invalid pool address');

  /** 1 - Fetch useful data */
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

  const roundDownWhileKeyNotFound = (timestamp: number): number => {
    let epoch = Math.floor(timestamp / HOUR);
    while (!Object.values(merklIndex).includes(epoch)) {
      epoch -= 1;
    }
    return epoch;
  };
  const fetchTree = async (epoch: number): Promise<AggregatedRewardsType> => {
    return (
      await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${epoch}.json`}`, {
        timeout: 5000,
      })
    ).data;
  };
  const poolName = (poolApiData: MerklAPIData['pools'][string]): string => {
    return `${AMMType[poolApiData.amm]} ${poolApiData.tokenSymbol0}-${poolApiData.tokenSymbol1} ${poolApiData.poolFee + '%' ?? ``}`;
  };

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const startEpoch = roundDownWhileKeyNotFound(startTimestamp);
  const endEpoch = roundDownWhileKeyNotFound(endTimestamp);
  let startTree, endTree;
  await Promise.all([fetchTree(startEpoch).then((res) => (startTree = res)), fetchTree(endEpoch).then((res) => (endTree = res))]);

  console.log(
    `Analyzing ${user} rewards on Merkl from ${moment.unix(startEpoch * HOUR).format('ddd DD MMM YYYY HH:00')} to ${moment
      .unix(endEpoch * HOUR)
      .format('ddd DD MMM YYYY HH:00')} over ${endEpoch - startEpoch} hours`
  );

  const accumulatedRewards: {
    earned: number;
    symbol: string;
    poolName: string;
    reason: string;
    distribution: string;
    amm: number;
    pool: string;
  }[] = [];
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
          earned,
          symbol,
          reason,
          poolName: poolName(poolApiData),
          amm: endTree?.rewards?.[k]?.amm,
          distribution: k,
          pool,
        });
      }
    }
  }
  console.log(`\nThe following rewards where accumulated: \n`);

  console.table(accumulatedRewards, ['earned', 'symbol', 'poolName', 'reason', 'pool']);

  console.log(`\nAggregated per token, it gives: \n`);

  console.table(
    accumulatedTokens.map((symbol) =>
      accumulatedRewards
        .filter((a) => a.symbol === symbol)
        .reduce(
          (prev, curr) => {
            return { diff: prev.diff + curr.earned, symbol };
          },
          { diff: 0, symbol }
        )
    ),
    ['diff', 'symbol']
  );

  if (!!pool) {
    const merklAPIPoolData = merklAPIData?.pools?.[getAddress(pool)];
    const poolRewards = accumulatedRewards.filter((a) => getAddress(a.pool) === getAddress(pool));

    console.log(
      '\n\n//////////////////////////////////////////////////////////////////////////////////////////////////////////////////\n\n'
    );

    console.log(`\nNow, let's break it down for the pool ${poolName(merklAPIPoolData)} (${pool}): \n`);
    console.log(`Over the period this address earned the following rewards: \n`);
    console.table(poolRewards, ['earned', 'symbol', 'reason']);

    const periodReward = poolRewards.reduce((prev, curr) => prev + curr.earned * prices[curr.symbol], 0);
    console.log(
      `Under the current price, it is worth ~$${formatNumber(periodReward)}, which would make ~$${formatNumber(
        (periodReward * YEAR) / (endEpoch * HOUR - startEpoch * HOUR)
      )} over a year. \n`
    );

    const amm = poolRewards[0].amm;

    // TODO Extend compatibility to other Algo type than Uniswap V3
    if (AMMAlgorithmMapping[amm] !== AMMAlgorithmType.UniswapV3) throw new Error('Only UniswapV3 AMM Algorithm type is supported for now');
    const alms = merklAPIPoolData.almDetails;
    const token0 = merklAPIPoolData.token0;
    const token0Decimals = merklAPIPoolData.decimalToken0;
    const token0Symbol = merklAPIPoolData.tokenSymbol0;
    const token1 = merklAPIPoolData.token1;
    const token1Decimals = merklAPIPoolData.decimalToken1;
    const token1Symbol = merklAPIPoolData.tokenSymbol1;

    const result = await request<
      {
        nft: PositionType[];
        nftPast: PositionType[];
        direct: PositionType[];
        directPast: PositionType[];
      },
      any
    >(merklSubgraphAMMEndpoints('prod')[chainId][amm], positionsQuery, {
      owners: [user?.toLowerCase()].concat(alms.map((a) => a.address.toLowerCase())),
      pool: pool?.toLowerCase(),
      timestamp: startEpoch * HOUR,
    });

    const directPositions = result.direct.concat(result.directPast);
    const nftPositions = result.nft.concat(result.nftPast);

    const startBlockNumber = await getBlockAfterTimestamp(chainId, startEpoch * HOUR);
    const endBlockNumber = await getBlockAfterTimestamp(chainId, endTimestamp * HOUR);

    const provider = httpProvider(chainId);
    const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', provider);
    const calls: Multicall3.Call3Struct[] = [];

    // 0 - Pool generic data
    calls.push(
      {
        allowFailure: true,
        callData: poolInterface.encodeFunctionData('slot0'),
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

    const analyzePoolState = async (blockNumber: number) => {
      const res = await multicall.callStatic.aggregate3(calls, { blockTag: blockNumber });

      // Decoding part
      const Positions: Partial<{
        lowerTick: number;
        tick: number;
        upperTick: number;
        type: string;
        amount0: number;
        amount1: number;
        liquidity: string;
        inRange: boolean;
        tvl: number;
        propFee: number;
        propAmount0: number;
        propAmount1: number;
        inducedAPR: number;
      }>[] = [];
      const positions: typeof Positions = [];

      let i = 0;
      const sqrtPriceX96 = poolInterface.decodeFunctionResult('slot0', res[i++]?.returnData).sqrtPriceX96?.toString();
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
        const positionRewards = poolRewards.filter((p) => p.reason === type)?.[0] ?? { earned: 0, symbol: 'ANGLE' };

        positions.push({
          lowerTick: pos.tickLower,
          tick,
          upperTick: pos.tickUpper,
          type,
          amount0: BN2Number(amount0, token0Decimals),
          amount1: BN2Number(amount1, token1Decimals),
          liquidity: liquidity?.toString(),
          inRange,
          tvl,
          propFee: inRange ? round(Int256.from(liquidity, 0).mul(10000).div(liquidityInPool).toNumber() / 100, 2) : 0,
          propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / amount0InPool) * 100, 2) : 0,
          propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / amount1InPool) * 100, 2) : 0,
          inducedAPR: round(
            ((positionRewards.earned * prices[positionRewards.symbol] * YEAR) / (endEpoch * HOUR - startEpoch * HOUR) / tvl) * 100,
            3
          ),
        });
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
          const positionRewards = poolRewards.filter((p) => p.reason === type)?.[0] ?? { earned: 0, symbol: 'ANGLE' };

          if (userAmount0InAlm !== 0 || userAmount1InAlm !== 0) {
            positions.push({
              type,
              amount0: userAmount0InAlm,
              amount1: userAmount1InAlm,
              liquidity: liquidityInAlm
                .mul(Math.round(proportion * 1e8))
                .div(1e8)
                .toString(),
              tvl,
              propFee: round((proportion * Int256.from(liquidityInAlm, 0).mul(10000).div(liquidityInPool).toNumber()) / 100, 2),
              propAmount0: round((userAmount0InAlm / amount0InPool) * 100, 2),
              propAmount1: round((userAmount1InAlm / amount1InPool) * 100, 2),
              inducedAPR: round(
                ((positionRewards.earned * prices[positionRewards.symbol] * YEAR) / (endEpoch * HOUR - startEpoch * HOUR) / tvl) * 100,
                3
              ),
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

      console.log(`The TVL of the pool at the time based on current prices was ${tvlInPool}`);
      console.table(positions);
    };

    console.log(`\n\nState of the pool at the beginning of the period (block ${startBlockNumber}): \n`);
    await analyzePoolState(startBlockNumber);

    console.log(`\n\nState of the pool at the end of the period (block ${endBlockNumber}): \n`);
    await analyzePoolState(endBlockNumber);
  }
};
