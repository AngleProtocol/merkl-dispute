import {
  AggregatedRewardsType,
  ALMType,
  AMMAlgorithmMapping,
  AMMAlgorithmType,
  ChainId,
  Erc20__factory,
  getTickAtSqrtRatio,
  Int256,
  MerklAPIData,
  merklSubgraphAMMEndpoints,
  Multicall__factory,
  UniswapV3NFTManager__factory,
  UniswapV3Pool__factory,
} from '@angleprotocol/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber, utils } from 'ethers';

dotenv.config();

import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import { BN2Number } from '@angleprotocol/sdk/dist/utils';
import console from 'console';
import { getAddress } from 'ethers/lib/utils';
import request, { gql } from 'graphql-request';
import JSBI from 'jsbi';
import moment from 'moment';

import { ANGLE_API, GITHUB_URL, HOUR } from '../constants';
import { fetchPoolName, round } from '../helpers';
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
    axios.get<{ rate: number; token: string }[]>('https://api.angle.money/v1/prices').then((res) => {
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
  // Pool Name cache
  const poolName = {};

  const accumulatedRewards: { diff: number; symbol: string; poolName: string; distribution: string; amm: number; pool: string }[] = [];
  const accumulatedTokens = [];

  for (const k of Object.keys(endTree.rewards)) {
    if (startTree?.rewards?.[k]?.holders?.[user]?.amount !== endTree?.rewards?.[k]?.holders?.[user]?.amount) {
      const symbol = endTree?.rewards?.[k].tokenSymbol;
      if (!accumulatedTokens.includes(symbol)) {
        accumulatedTokens.push(symbol);
      }
      const decimals = endTree?.rewards?.[k].tokenDecimals;
      const pool = endTree?.rewards?.[k]?.pool;
      const diff = Int256.from(
        BigNumber.from(endTree?.rewards?.[k]?.holders?.[user]?.amount ?? 0).sub(startTree?.rewards?.[k]?.holders?.[user]?.amount ?? 0),
        decimals
      ).toNumber();

      if (!poolName[pool]) {
        try {
          poolName[pool] = await fetchPoolName(chainId, pool, endTree?.rewards?.[k]?.amm);
        } catch {}
      }

      accumulatedRewards.push({
        diff,
        symbol,
        poolName: poolName[pool],
        amm: endTree?.rewards?.[k]?.amm,
        distribution: k,
        pool,
      });
    }
  }
  console.log(`\nThe following rewards where accumulated: \n`);

  console.table(accumulatedRewards, ['diff', 'symbol', 'poolName', 'distribution', 'pool']);

  console.log(`\nAggregated per token, it gives: \n`);

  console.table(
    accumulatedTokens.map((symbol) =>
      accumulatedRewards
        .filter((a) => a.symbol === symbol)
        .reduce(
          (prev, curr) => {
            return { diff: prev.diff + curr.diff, symbol };
          },
          { diff: 0, symbol }
        )
    ),
    ['diff', 'symbol']
  );

  const poolRewards = accumulatedRewards.filter((a) => a.poolName === poolName[pool]);

  if (!!pool && poolRewards.length > 0) {
    console.log(`\nNow, let's break it down for the pool ${poolName[pool]} (${pool}): \n`);
    const amm = poolRewards[0].amm;

    // TODO Extend compatibility
    if (AMMAlgorithmMapping[amm] !== AMMAlgorithmType.UniswapV3) throw new Error('Only UniswapV3 AMM Algorithm type is supported for now');

    const apiData = ((await axios.get(ANGLE_API + `v1/merkl`)).data as MerklAPIData).pools[getAddress(pool)];
    const alms = apiData.almDetails;
    const token0 = apiData.token0;
    const token0Decimals = apiData.decimalToken0;
    const token0Symbol = apiData.tokenSymbol0;
    const token1 = apiData.token1;
    const token1Decimals = apiData.decimalToken1;
    const token1Symbol = apiData.tokenSymbol1;

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
        target: pool,
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

    const startRes = await multicall.callStatic.aggregate3(calls, { blockTag: startBlockNumber });
    const endRes = await multicall.callStatic.aggregate3(calls, { blockTag: endBlockNumber });

    // Decoding part
    const startPositions: Partial<{
      lowerTick: number;
      tick: number;
      upperTick: number;
      type: 'direct' | 'nft' | string;
      amount0: number;
      amount1: number;
      liquidity: string;
      inRange: boolean;
      tvl: number;
      propFee: number;
      propAmount0: number;
      propAmount1: number;
    }>[] = [];
    const endPositions: typeof startPositions = [];

    let i = 0;
    const startSqrtPriceX96 = poolInterface.decodeFunctionResult('slot0', startRes[i]?.returnData).sqrtPriceX96?.toString();
    const startTick = getTickAtSqrtRatio(JSBI.BigInt(startSqrtPriceX96));
    const endSqrtPriceX96 = poolInterface.decodeFunctionResult('slot0', endRes[i++]?.returnData).sqrtPriceX96?.toString();
    const endTick = getTickAtSqrtRatio(JSBI.BigInt(endSqrtPriceX96));

    const startLiquidity = poolInterface.decodeFunctionResult('liquidity', startRes[i]?.returnData)[0]?.toString();
    const endLiquidity = poolInterface.decodeFunctionResult('liquidity', endRes[i++]?.returnData)[0]?.toString();

    const startAmount0 = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', startRes[i]?.returnData)[0], token0Decimals);
    const endAmount0 = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', endRes[i++]?.returnData)[0], token0Decimals);

    const startAmount1 = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', startRes[i]?.returnData)[0], token1Decimals);
    const endAmount1 = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', endRes[i++]?.returnData)[0], token1Decimals);

    for (const pos of directPositions.filter((p) => p.owner === user.toLowerCase())) {
      try {
        const startPosition = poolInterface.decodeFunctionResult('positions', startRes[i]?.returnData);
        const [amount0, amount1] = getAmountsForLiquidity(
          startSqrtPriceX96,
          Number(pos.tickLower),
          Number(pos.tickUpper),
          BigNumber.from(startPosition.liquidity)
        );
        const inRange = Number(pos.tickLower) <= startTick && startTick < Number(pos.tickUpper);

        startPositions.push({
          lowerTick: pos.tickLower,
          tick: startTick,
          upperTick: pos.tickUpper,
          type: 'direct',
          amount0: BN2Number(amount0, token0Decimals),
          amount1: BN2Number(amount1, token0Decimals),
          liquidity: startPosition.liquidity,
          inRange,
          tvl: BN2Number(amount0, token0Decimals) * prices[token0Symbol] + BN2Number(amount1, token1Decimals) * prices[token1Symbol],
          propFee: inRange ? round(Int256.from(startPosition.liquidity, 0).mul(10000).div(startLiquidity).toNumber() / 100, 2) : 0,
          propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / startAmount0) * 100, 2) : 0,
          propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / startAmount1) * 100, 2) : 0,
        });
      } catch (e) {
        console.error(e);
      }
      try {
        const endPosition = poolInterface.decodeFunctionResult('positions', endRes[i++]?.returnData);
        const [amount0, amount1] = getAmountsForLiquidity(
          startSqrtPriceX96,
          Number(pos.tickLower),
          Number(pos.tickUpper),
          BigNumber.from(endPosition.liquidity)
        );
        const inRange = Number(pos.tickLower) <= endTick && endTick < Number(pos.tickUpper);

        endPosition.push({
          lowerTick: pos.tickLower,
          tick: endTick,
          upperTick: pos.tickUpper,
          type: 'direct',
          amount0: BN2Number(amount0, token0Decimals),
          amount1: BN2Number(amount1, token0Decimals),
          liquidity: endPosition.liquidity,
          inRange,
          tvl: BN2Number(amount0, token0Decimals) * prices[token0Symbol] + BN2Number(amount1, token1Decimals) * prices[token1Symbol],
          propFee: inRange ? round(Int256.from(endPosition.liquidity, 0).mul(10000).div(endLiquidity).toNumber() / 100, 2) : 0,
          propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / endAmount0) * 100, 2) : 0,
          propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / endAmount1) * 100, 2) : 0,
        });
      } catch (e) {
        console.error(e);
      }
    }

    for (const pos of nftPositions.filter((p) => p.owner === user.toLowerCase())) {
      try {
        const startPosition = nftManagerInterface.decodeFunctionResult('positions', startRes[i]?.returnData);
        const [amount0, amount1] = getAmountsForLiquidity(
          startSqrtPriceX96,
          Number(pos.tickLower),
          Number(pos.tickUpper),
          BigNumber.from(startPosition.liquidity)
        );
        const inRange = Number(pos.tickLower) <= startTick && startTick < Number(pos.tickUpper);

        startPositions.push({
          lowerTick: pos.tickLower,
          tick: startTick,
          upperTick: pos.tickUpper,
          type: 'nft',
          amount0: BN2Number(amount0, token0Decimals),
          amount1: BN2Number(amount1, token0Decimals),
          liquidity: startPosition.liquidity,
          inRange,
          tvl: BN2Number(amount0, token0Decimals) * prices[token0Symbol] + BN2Number(amount1, token1Decimals) * prices[token1Symbol],
          propFee: inRange ? round(Int256.from(startPosition.liquidity, 0).mul(10000).div(startLiquidity).toNumber() / 100, 2) : 0,
          propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / startAmount0) * 100, 2) : 0,
          propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / startAmount1) * 100, 2) : 0,
        });
      } catch (e) {
        console.error(e);
      }
      try {
        const endPosition = poolInterface.decodeFunctionResult('positions', endRes[i++]?.returnData);
        const [amount0, amount1] = getAmountsForLiquidity(
          startSqrtPriceX96,
          Number(pos.tickLower),
          Number(pos.tickUpper),
          BigNumber.from(endPosition.liquidity)
        );
        const inRange = Number(pos.tickLower) <= endTick && endTick < Number(pos.tickUpper);

        endPosition.push({
          lowerTick: pos.tickLower,
          tick: endTick,
          upperTick: pos.tickUpper,
          type: 'nft',
          amount0: BN2Number(amount0, token0Decimals),
          amount1: BN2Number(amount1, token0Decimals),
          liquidity: endPosition.liquidity,
          inRange,
          tvl: BN2Number(amount0, token0Decimals) * prices[token0Symbol] + BN2Number(amount1, token1Decimals) * prices[token1Symbol],
          propFee: inRange ? round(Int256.from(endPosition.liquidity, 0).mul(10000).div(endLiquidity).toNumber() / 100, 2) : 0,
          propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / endAmount0) * 100, 2) : 0,
          propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / endAmount1) * 100, 2) : 0,
        });
      } catch (e) {
        console.error(e);
      }
    }

    for (const alm of alms) {
      let startAlmAmount0 = 0;
      let startAlmAmount1 = 0;
      let startAlmLiquidity = BigNumber.from(0);
      let endAlmAmount0 = 0;
      let endAlmAmount1 = 0;
      let endAlmLiquidity = BigNumber.from(0);

      for (const pos of directPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
        try {
          const startPosition = poolInterface.decodeFunctionResult('positions', startRes[i]?.returnData);
          const [aux0, aux1] = getAmountsForLiquidity(
            startSqrtPriceX96,
            Number(pos.tickLower),
            Number(pos.tickUpper),
            BigNumber.from(startPosition.liquidity)
          );
          const inRange = Number(pos.tickLower) <= endTick && endTick < Number(pos.tickUpper);

          startAlmAmount0 += BN2Number(aux0, token0Decimals);
          startAlmAmount1 += BN2Number(aux1, token1Decimals);
          if (inRange) startAlmLiquidity = startAlmLiquidity.add(startPosition.liquidity);
        } catch (e) {
          console.error(e);
        }
        try {
          const endPosition = poolInterface.decodeFunctionResult('positions', endRes[i++]?.returnData);
          const [aux0, aux1] = getAmountsForLiquidity(
            startSqrtPriceX96,
            Number(pos.tickLower),
            Number(pos.tickUpper),
            BigNumber.from(endPosition.liquidity)
          );
          const inRange = Number(pos.tickLower) <= endTick && endTick < Number(pos.tickUpper);

          endAlmAmount0 += BN2Number(aux0, token0Decimals);
          endAlmAmount1 += BN2Number(aux1, token1Decimals);
          if (inRange) endAlmLiquidity = endAlmLiquidity.add(endPosition.liquidity);
        } catch (e) {
          console.error(e);
        }
      }

      // 4 - ALM NFT positions
      for (const pos of nftPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
        try {
          const startPosition = nftManagerInterface.decodeFunctionResult('positions', startRes[i]?.returnData);
          const [aux0, aux1] = getAmountsForLiquidity(
            startSqrtPriceX96,
            Number(pos.tickLower),
            Number(pos.tickUpper),
            BigNumber.from(startPosition.liquidity)
          );
          const inRange = Number(pos.tickLower) <= endTick && endTick < Number(pos.tickUpper);

          startAlmAmount0 += BN2Number(aux0, token0Decimals);
          startAlmAmount1 += BN2Number(aux1, token1Decimals);
          if (inRange) startAlmLiquidity += startPosition.liquidity;
        } catch (e) {
          console.error(e);
        }
        try {
          const endPosition = nftManagerInterface.decodeFunctionResult('positions', endRes[i++]?.returnData);
          const [aux0, aux1] = getAmountsForLiquidity(
            startSqrtPriceX96,
            Number(pos.tickLower),
            Number(pos.tickUpper),
            BigNumber.from(endPosition.liquidity)
          );
          const inRange = Number(pos.tickLower) <= endTick && endTick < Number(pos.tickUpper);

          endAlmAmount0 += BN2Number(aux0, token0Decimals);
          endAlmAmount1 += BN2Number(aux1, token1Decimals);
          if (inRange) endAlmLiquidity += endPosition.liquidity;
        } catch (e) {
          console.error(e);
        }
      }

      // 5 - Balance / Total Supply
      const startProportion =
        BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', startRes[i]?.returnData)[0]) /
        BN2Number(Erc20Interface.decodeFunctionResult('totalSupply', startRes[i + 1]?.returnData)[0]);
      const endProportion =
        BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', endRes[i]?.returnData)[0]) /
        BN2Number(Erc20Interface.decodeFunctionResult('totalSupply', endRes[i + 1]?.returnData)[0]);
      i++;

      startPositions.push({
        type: ALMType[alm.origin],
        amount0: startProportion * startAlmAmount0,
        amount1: startProportion * startAlmAmount1,
        liquidity: startAlmLiquidity
          .mul(Math.round(startProportion * 1e8))
          .div(1e8)
          .toString(),
        tvl: startProportion * (startAlmAmount0 * prices[token0Symbol] + startAlmAmount1 * prices[token1Symbol]),
        propFee: round((startProportion * Int256.from(startAlmLiquidity, 0).mul(10000).div(endAlmLiquidity).toNumber()) / 100, 2),
        propAmount0: round(((startProportion * startAlmAmount0) / startAmount0) * 100, 2),
        propAmount1: round(((startProportion * startAlmAmount1) / startAmount1) * 100, 2),
      });

      endPositions.push({
        type: ALMType[alm.origin],
        amount0: endProportion * endAlmAmount0,
        amount1: endProportion * endAlmAmount1,
        liquidity: endAlmLiquidity
          .mul(Math.round(endProportion * 1e8))
          .div(1e8)
          .toString(),
        tvl: endProportion * (endAlmAmount0 * prices[token0Symbol] + endAlmAmount1 * prices[token1Symbol]),
        propFee: round((endProportion * Int256.from(endAlmLiquidity, 0).mul(10000).div(endAlmLiquidity).toNumber()) / 100, 2),
        propAmount0: round(((endProportion * endAlmAmount0) / endAmount0) * 100, 2),
        propAmount1: round(((endProportion * endAlmAmount1) / endAmount1) * 100, 2),
      });
    }

    console.log(`\nAt the beginning of the period the user had the following positions: \n`);
    console.table(startPositions);
    console.log(`\nAt the end of the period the user had the following positions: \n`);
    console.table(endPositions);
  }
};
