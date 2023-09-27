import {
  ALMType,
  AMMAlgorithmMapping,
  AMMType,
  calculatorUsedWrappersList,
  ChainId,
  Erc20__factory,
  formatNumber,
  getTickAtSqrtRatio,
  Int256,
  merklSubgraphAMMEndpoints,
  Multicall__factory,
  NFTManagerAddress,
  NonFungiblePositionManagerInterface,
  PoolInterface,
  PoolStateName,
  SwapPriceField,
  WrapperType,
} from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import { BigNumber, BigNumberish, utils } from 'ethers';

dotenv.config();

import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import { BN2Number } from '@angleprotocol/sdk/dist/utils';
import console from 'console';
import { getAddress } from 'ethers/lib/utils';
import request from 'graphql-request';
import JSBI from 'jsbi';
import moment from 'moment';

import { HOUR, MULTICALL_ADDRESS, YEAR } from '../constants';
import { round } from '../helpers';
import { positionsQuery } from '../helpers/queries';
import { httpProvider } from '../providers';
import { AccumulatedRewards, PositionType } from '../types';
import { getBlockAfterTimestamp } from '../utils';
import { fetchReportData, fetchRewardJson, paramsCheck, poolName } from '../utils/report';
import { getAmountsForLiquidity } from '../utils/uniV3';

const Erc20Interface = Erc20__factory.createInterface();
/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                 MAIN FUNCTION                                                  
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

// Timestamps will be rounded to the previous reward computation epoch
export const reportAlm = async (
  chainId: ChainId,
  almAddress: string,
  almType: ALMType,
  startTimestamp: number,
  endTimestamp: number,
  pool?: string
): Promise<void> => {
  paramsCheck(almAddress, pool, startTimestamp, endTimestamp);
  const ALMname = ALMType[almType];
  /** 1 - Fetch useful data */
  const { prices, merklIndex, merklAPIData } = await fetchReportData(chainId);

  /** 2 - Rounds down timestamp to the last reward computation and fetch trees */
  const { startEpoch, endEpoch, startTree, endTree } = await fetchRewardJson(chainId, merklIndex, startTimestamp, endTimestamp);

  const accumulatedRewards: AccumulatedRewards[] = [];
  const accumulatedTokens = [];

  console.log(
    `Analyzing rewards earned by ${ALMname}-${almAddress} on Merkl over ${endEpoch - startEpoch} hours from ${moment
      .unix(startEpoch * HOUR)
      .format('ddd DD MMM YYYY HH:00')} to ${moment.unix(endEpoch * HOUR).format('ddd DD MMM YYYY HH:00')} `
  );

  for (const k of Object.keys(endTree.rewards)) {
    const { rewards, tokens } = Object.keys(endTree?.rewards?.[k]?.holders).reduce(
      (cur, user) => {
        const newAmount = endTree?.rewards?.[k]?.holders?.[user]?.amount;
        const oldAmount = startTree?.rewards?.[k]?.holders?.[user]?.amount;
        const newBreakdown = endTree?.rewards?.[k]?.holders?.[user]?.breakdown;
        const oldBreakdown = startTree?.rewards?.[k]?.holders?.[user]?.breakdown;

        if (newAmount !== oldAmount && Object.keys(newBreakdown).includes(ALMname)) {
          const symbol = endTree?.rewards?.[k].tokenSymbol;
          if (!tokens.includes(symbol)) {
            tokens.push(symbol);
          }
          const decimals = endTree?.rewards?.[k].tokenDecimals;
          const pool = endTree?.rewards?.[k]?.pool;
          const earned = Int256.from(BigNumber.from(newBreakdown?.[ALMname] ?? 0).sub(oldBreakdown?.[ALMname] ?? 0), decimals).toNumber();

          const poolApiData = merklAPIData?.pools?.[getAddress(pool)];

          cur.rewards.Earned += earned;
          cur.rewards.Token = symbol;
          cur.rewards.Origin = ALMname;
          cur.rewards.PoolName = poolName(poolApiData);
          cur.rewards.Amm = endTree?.rewards?.[k]?.amm;
          cur.rewards.Distribution = k;
          cur.rewards.PoolAddress = pool;

          return cur;
        }
      },
      { rewards: {} as AccumulatedRewards, tokens: [] }
    );
    accumulatedRewards.push(rewards);
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

  //   if (!!pool) {
  //     const merklAPIPoolData = merklAPIData?.pools?.[getAddress(pool)];
  //     const poolRewards = accumulatedRewards.filter((a) => getAddress(a.PoolAddress) === getAddress(pool));
  //     /*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //                                                   INTERFACES
  //     //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/
  //     const amm = merklAPIPoolData.amm;
  //     const ammAlgo = AMMAlgorithmMapping[amm];

  //     const poolInterface = PoolInterface(ammAlgo);
  //     const nftManagerInterface = NonFungiblePositionManagerInterface(ammAlgo);
  //     const poolStateName = PoolStateName[ammAlgo];
  //     const swapPriceField = SwapPriceField[ammAlgo];

  //     console.log('\n//////////////////////////////////////////////////////////////////////////////////////////////////////////////////\n');

  //     console.log(`Now, let's break down rewards for the pool ${poolName(merklAPIPoolData)} (${pool}): \n`);
  //     console.log(`Over the period of interest this address earned the following: \n`);
  //     console.table(poolRewards, ['Earned', 'Token', 'Origin']);

  //     const periodReward = poolRewards.reduce((prev, curr) => prev + curr.Earned * prices[curr.Token], 0);
  //     console.log(
  //       `At current prices, this is worth ~$${formatNumber(periodReward)}, which would make ~$${formatNumber(
  //         (periodReward * YEAR) / (endEpoch * HOUR - startEpoch * HOUR)
  //       )} over a year. \n`
  //     );

  //     const alms = merklAPIPoolData.almDetails;
  //     const token0 = merklAPIPoolData.token0;
  //     const token0Decimals = merklAPIPoolData.decimalToken0;
  //     const token0Symbol = merklAPIPoolData.tokenSymbol0;
  //     const token1 = merklAPIPoolData.token1;
  //     const token1Decimals = merklAPIPoolData.decimalToken1;
  //     const token1Symbol = merklAPIPoolData.tokenSymbol1;

  //     const result = await request<
  //       {
  //         nft: PositionType[];
  //         nftPast: PositionType[];
  //         direct: PositionType[];
  //         directPast: PositionType[];
  //       },
  //       any
  //     >(merklSubgraphAMMEndpoints('prod')[chainId][amm], positionsQuery, {
  //       owners: [user?.toLowerCase()].concat(alms.map((a) => a.address.toLowerCase())),
  //       pool: pool?.toLowerCase(),
  //       timestamp: startEpoch * HOUR,
  //     });

  //     const directPositions = result.direct.concat(result.directPast);
  //     const nftPositions = result.nft.concat(result.nftPast);

  //     const startBlockNumber = await getBlockAfterTimestamp(chainId, startEpoch * HOUR);
  //     const endBlockNumber = await getBlockAfterTimestamp(chainId, endEpoch * HOUR);

  //     const provider = httpProvider(chainId);
  //     const multicall = Multicall__factory.connect(MULTICALL_ADDRESS, provider);
  //     const calls: Multicall3.Call3Struct[] = [];

  //     // 0 - Pool generic data
  //     calls.push(
  //       {
  //         allowFailure: true,
  //         callData: poolInterface.encodeFunctionData(poolStateName),
  //         target: pool,
  //       },
  //       {
  //         allowFailure: true,
  //         callData: poolInterface.encodeFunctionData('liquidity'),
  //         target: pool,
  //       },
  //       {
  //         allowFailure: true,
  //         callData: Erc20Interface.encodeFunctionData('balanceOf', [pool]),
  //         target: token0,
  //       },
  //       {
  //         allowFailure: true,
  //         callData: Erc20Interface.encodeFunctionData('balanceOf', [pool]),
  //         target: token1,
  //       }
  //     );

  //     // 1 - User direct positions
  //     for (const pos of directPositions.filter((p) => p.owner === user.toLowerCase())) {
  //       calls.push({
  //         allowFailure: true,
  //         callData: poolInterface.encodeFunctionData('positions', [
  //           utils.solidityKeccak256(['address', 'int24', 'int24'], [pos.owner, pos.tickLower, pos.tickUpper]),
  //         ]),
  //         target: pool,
  //       });
  //     }

  //     // 2 - User NFT positions
  //     for (const pos of nftPositions.filter((p) => p.owner === user.toLowerCase())) {
  //       calls.push({
  //         allowFailure: true,
  //         callData: nftManagerInterface.encodeFunctionData('positions', [pos.id]),
  //         target: NFTManagerAddress[chainId][amm],
  //       });
  //     }

  //     // ALM data
  //     for (const alm of alms) {
  //       // 3 - ALM NFT positions
  //       for (const pos of directPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
  //         calls.push({
  //           allowFailure: true,
  //           callData: poolInterface.encodeFunctionData('positions', [
  //             utils.solidityKeccak256(['address', 'int24', 'int24'], [pos.owner, pos.tickLower, pos.tickUpper]),
  //           ]),
  //           target: pool,
  //         });
  //       }

  //       // 4 - ALM NFT positions
  //       for (const pos of nftPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
  //         calls.push({
  //           allowFailure: true,
  //           callData: nftManagerInterface.encodeFunctionData('positions', [pos.id]),
  //           target: pool,
  //         });
  //       }

  //       // 5 - Balance / Total Supply
  //       calls.push(
  //         {
  //           allowFailure: true,
  //           callData: Erc20Interface.encodeFunctionData('totalSupply'),
  //           target: alm.address,
  //         },
  //         {
  //           allowFailure: true,
  //           callData: Erc20Interface.encodeFunctionData('balanceOf', [user]),
  //           target: alm.address,
  //         }
  //       );
  //     }

  //     const analyzePoolState = async (blockNumber: number) => {
  //       const res = await multicall.callStatic.aggregate3(calls, { blockTag: blockNumber });

  //       // Decoding part
  //       const Positions: Partial<{
  //         lowerTick: number;
  //         tick: number;
  //         upperTick: number;
  //         type: string;
  //         amount0: number;
  //         amount1: number;
  //         liquidity: string;
  //         inRange: boolean;
  //         tvl: number;
  //         propFee: number;
  //         propAmount0: number;
  //         propAmount1: number;
  //         inducedAPR: number;
  //       }>[] = [];
  //       const positions: typeof Positions = [];

  //       let i = 0;
  //       const sqrtPriceX96 = poolInterface.decodeFunctionResult(poolStateName, res[i++]?.returnData)[swapPriceField]?.toString();
  //       const liquidityInPool = poolInterface.decodeFunctionResult('liquidity', res[i++]?.returnData)[0]?.toString();
  //       const amount0InPool = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', res[i++]?.returnData)[0], token0Decimals);
  //       const amount1InPool = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', res[i++]?.returnData)[0], token1Decimals);
  //       const tvlInPool = amount0InPool * prices[token0Symbol] + amount1InPool * prices[token1Symbol];

  //       const tick = getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96));
  //       const addPositionInArray = (pos: PositionType, type: string, liquidity: BigNumberish) => {
  //         const [amount0, amount1] = getAmountsForLiquidity(
  //           sqrtPriceX96,
  //           Number(pos.tickLower),
  //           Number(pos.tickUpper),
  //           BigNumber.from(liquidity)
  //         );
  //         const inRange = Number(pos.tickLower) <= tick && tick < Number(pos.tickUpper);

  //         const tvl = BN2Number(amount0, token0Decimals) * prices[token0Symbol] + BN2Number(amount1, token1Decimals) * prices[token1Symbol];
  //         const positionRewards = poolRewards.filter((p) => p.Origin === type)?.[0] ?? { Earned: 0, Token: 'ANGLE' };

  //         positions.push({
  //           lowerTick: pos.tickLower,
  //           tick,
  //           upperTick: pos.tickUpper,
  //           type,
  //           amount0: BN2Number(amount0, token0Decimals),
  //           amount1: BN2Number(amount1, token1Decimals),
  //           liquidity: liquidity?.toString(),
  //           inRange,
  //           tvl,
  //           propFee: inRange ? round(Int256.from(liquidity, 0).mul(10000).div(liquidityInPool).toNumber() / 100, 2) : 0,
  //           propAmount0: inRange ? round((BN2Number(amount0, token0Decimals) / amount0InPool) * 100, 2) : 0,
  //           propAmount1: inRange ? round((BN2Number(amount1, token1Decimals) / amount1InPool) * 100, 2) : 0,
  //           inducedAPR: round(
  //             ((positionRewards.Earned * prices[positionRewards.Token] * YEAR) / (endEpoch * HOUR - startEpoch * HOUR) / tvl) * 100,
  //             3
  //           ),
  //         });
  //       };

  //       for (const pos of directPositions.filter((p) => p.owner === user.toLowerCase())) {
  //         try {
  //           const position = poolInterface.decodeFunctionResult('positions', res[i]?.returnData);
  //           addPositionInArray(pos, AMMType[amm], position.liquidity);
  //         } catch (e) {
  //           console.error(e);
  //         }
  //         i++;
  //       }

  //       for (const pos of nftPositions.filter((p) => p.owner === user.toLowerCase())) {
  //         try {
  //           const position = nftManagerInterface.decodeFunctionResult('positions', res[i]?.returnData);
  //           addPositionInArray(pos, AMMType[amm], position.liquidity);
  //         } catch (e) {
  //           console.error(e);
  //         }
  //         i++;
  //       }

  //       for (const alm of alms) {
  //         try {
  //           let j = i;
  //           let amount0InAlm = 0;
  //           let amount1InAlm = 0;
  //           let liquidityInAlm = BigNumber.from(0);

  //           for (const pos of directPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
  //             const position = poolInterface.decodeFunctionResult('positions', res[j++]?.returnData);
  //             const [aux0, aux1] = getAmountsForLiquidity(
  //               sqrtPriceX96,
  //               Number(pos.tickLower),
  //               Number(pos.tickUpper),
  //               BigNumber.from(position.liquidity)
  //             );
  //             const inRange = Number(pos.tickLower) <= tick && tick < Number(pos.tickUpper);

  //             amount0InAlm += BN2Number(aux0, token0Decimals);
  //             amount1InAlm += BN2Number(aux1, token1Decimals);
  //             if (inRange) liquidityInAlm = liquidityInAlm.add(position.liquidity);
  //           }

  //           // 4 - ALM NFT positions
  //           for (const pos of nftPositions.filter((p) => p.owner === alm.address.toLowerCase())) {
  //             const position = nftManagerInterface.decodeFunctionResult('positions', res[j++]?.returnData);
  //             const [aux0, aux1] = getAmountsForLiquidity(
  //               sqrtPriceX96,
  //               Number(pos.tickLower),
  //               Number(pos.tickUpper),
  //               BigNumber.from(position.liquidity)
  //             );
  //             const inRange = Number(pos.tickLower) <= tick && tick < Number(pos.tickUpper);

  //             amount0InAlm += BN2Number(aux0, token0Decimals);
  //             amount1InAlm += BN2Number(aux1, token1Decimals);
  //             if (inRange) liquidityInAlm = liquidityInAlm.add(position.liquidity);
  //           }

  //           // 5 - Balance / Total Supply
  //           const supply = BN2Number(Erc20Interface.decodeFunctionResult('totalSupply', res[j++]?.returnData)[0]);
  //           const balance = BN2Number(Erc20Interface.decodeFunctionResult('balanceOf', res[j++]?.returnData)[0]);
  //           const proportion = balance / supply;

  //           const userAmount0InAlm = proportion * amount0InAlm;
  //           const userAmount1InAlm = proportion * amount1InAlm;

  //           const type = ALMType[alm.origin];
  //           const tvl = userAmount0InAlm * prices[token0Symbol] + userAmount1InAlm * prices[token1Symbol];
  //           const positionRewards = poolRewards.filter((p) => p.Origin === type)?.[0] ?? { Earned: 0, Token: 'ANGLE' };

  //           if (userAmount0InAlm !== 0 || userAmount1InAlm !== 0) {
  //             positions.push({
  //               type,
  //               amount0: userAmount0InAlm,
  //               amount1: userAmount1InAlm,
  //               liquidity: liquidityInAlm
  //                 .mul(Math.round(proportion * 1e8))
  //                 .div(1e8)
  //                 .toString(),
  //               tvl,
  //               propFee: round((proportion * Int256.from(liquidityInAlm, 0).mul(10000).div(liquidityInPool).toNumber()) / 100, 2),
  //               propAmount0: round((userAmount0InAlm / amount0InPool) * 100, 2),
  //               propAmount1: round((userAmount1InAlm / amount1InPool) * 100, 2),
  //               inducedAPR: round(
  //                 ((positionRewards.Earned * prices[positionRewards.Token] * YEAR) / (endEpoch * HOUR - startEpoch * HOUR) / tvl) * 100,
  //                 3
  //               ),
  //             });
  //           }
  //         } catch (e) {
  //           // console.error(e);
  //         }
  //         i =
  //           i +
  //           directPositions.filter((p) => p.owner === alm.address.toLowerCase())?.length +
  //           nftPositions.filter((p) => p.owner === alm.address.toLowerCase())?.length +
  //           2;
  //       }

  //       console.log(`The TVL of the pool at block ${blockNumber} based on current prices was $${tvlInPool}`);
  //       console.table(positions);
  //     };

  //     console.log(`\nState of the pool at the beginning of the period (block ${startBlockNumber}): \n`);
  //     await analyzePoolState(startBlockNumber);

  //     console.log(`\nState of the pool at the end of the period (block ${endBlockNumber}): \n`);
  //     await analyzePoolState(endBlockNumber);
  //   }
};
