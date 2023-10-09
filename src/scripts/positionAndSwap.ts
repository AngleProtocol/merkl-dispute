import {
  AMMAlgorithmMapping,
  AMMAlgorithmType,
  AMMType,
  ChainId,
  Erc20__factory,
  Int256,
  merklFallbackTGEndpoint,
  merklSubgraphAMMEndpoints,
  MerklSupportedChainIdsType,
  swapsSubgraphsEndpoint,
  UniswapV3Pool__factory,
  withRetry,
} from '@angleprotocol/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber, constants } from 'ethers';
import { request } from 'graphql-request';
import moment from 'moment';

import { PositionType, SwapType } from '../types';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                               END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

dotenv.config();

import { BATCH_NUMBER, TVL_THRESHOLD } from '../constants';
import { fetchPoolName, round } from '../helpers';
import { directPositionsQuery, nftPositionsQuery, swapQueryUniV3 } from '../helpers/queries';
import { httpProvider } from '../providers';
import { getAmountsForLiquidity } from '../utils/uniV3';

type PriceType = { [token: string]: number };
/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                  PARAMETERS                                                    
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId: ChainId = ChainId.POLYGON;
const amm: AMMType = AMMType.Retro;
const pool = '0x547fd24aa2ed09d86dac02e36b8ce84a59fd644f'.toLowerCase();

const startTimestamp = moment().unix() - 14400; // Cutoff to fetch positions
const endTimestamp = moment().unix() - 7200; // To filter swaps
const swaps_number = 100;
const subgraphMode = 'prod';

export async function fetchPositions(
  chainId: MerklSupportedChainIdsType,
  amm: AMMType,
  pool: string,
  startTimestamp: number,
  subgraphMode: 'prod' | 'dev' | 'local' = 'prod'
): Promise<{
  nftPositions: PositionType[];
  directPositions: PositionType[];
}> {
  /**
   * Positions
   */
  let minLiquidityOpen = constants.MaxUint256.toString();
  let minLiquidityClosed = constants.MaxUint256.toString();

  /**
   *  NFT positions
   */
  let isFullyFetched = false;
  let nftPositions: PositionType[] = [];
  while (!isFullyFetched) {
    const nftPositionsData = await withRetry<
      any,
      {
        openPositions: PositionType[];
        closedPositions: PositionType[];
      }
    >(request, [
      merklSubgraphAMMEndpoints(subgraphMode)[chainId][amm],
      nftPositionsQuery,
      {
        pool: pool,
        minLiquidityOpen: minLiquidityOpen,
        minLiquidityClosed: minLiquidityClosed,
        startTimestamp: startTimestamp,
      },
    ]);

    minLiquidityOpen =
      nftPositionsData?.openPositions.length > 0
        ? nftPositionsData?.openPositions[nftPositionsData?.openPositions.length - 1].liquidity
        : minLiquidityOpen;
    minLiquidityClosed =
      nftPositionsData?.closedPositions.length > 0
        ? nftPositionsData?.closedPositions[nftPositionsData?.closedPositions.length - 1].liquidity
        : minLiquidityOpen;

    if (nftPositionsData?.openPositions.length + nftPositionsData?.closedPositions.length < BATCH_NUMBER) {
      isFullyFetched = true;
    }

    const fetchedNFTPositions = nftPositionsData?.openPositions.concat(nftPositionsData?.closedPositions);

    nftPositions = nftPositions.concat(fetchedNFTPositions).filter((value, index, self) => index === self.findIndex((t) => t === value));
  }

  let directPositions: PositionType[] = [];
  isFullyFetched = false;
  minLiquidityOpen = constants.MaxUint256.toString();
  minLiquidityClosed = constants.MaxUint256.toString();
  while (!isFullyFetched) {
    /** Direct Positions (not handled by Uniswap NFT Manager)
     * @notice these positions were not opened through Uniswap frontend
     */
    const directPositionsData = await withRetry<
      any,
      {
        openPositions: PositionType[];
        closedPositions: PositionType[];
      }
    >(request, [
      merklSubgraphAMMEndpoints(subgraphMode)[chainId][amm],
      directPositionsQuery,
      {
        pool: pool,
        minLiquidityOpen: minLiquidityOpen,
        minLiquidityClosed: minLiquidityClosed,
        startTimestamp: startTimestamp,
      },
    ]);

    minLiquidityOpen =
      directPositionsData?.openPositions.length > 0
        ? directPositionsData?.openPositions[directPositionsData?.openPositions.length - 1].liquidity
        : minLiquidityOpen;
    minLiquidityClosed =
      directPositionsData?.closedPositions.length > 0
        ? directPositionsData?.closedPositions[directPositionsData?.closedPositions.length - 1].liquidity
        : minLiquidityOpen;

    if (directPositionsData?.openPositions.length + directPositionsData?.closedPositions.length < BATCH_NUMBER) {
      isFullyFetched = true;
    }

    /** Removes duplicated positions */
    const fetchedDirectPositions = directPositionsData?.openPositions
      .concat(directPositionsData.closedPositions)
      .map((position) => {
        return {
          id: position.id,
          endTimestamp: position.endTimestamp,
          owner: position.owner,
          startTimestamp: position.startTimestamp,
          tickLower: Number(position.tickLower),
          tickUpper: Number(position.tickUpper),
          liquidity: position.liquidity,
        };
      })
      .filter(
        (position, index, self) =>
          index ===
          self.findIndex((t) => t.owner === position.owner && t.tickLower === position.tickLower && t.tickUpper === position.tickUpper)
      );
    directPositions = directPositions
      .concat(fetchedDirectPositions)
      .filter(
        (value, index, self) =>
          index ===
          self.findIndex((t) => t?.owner === value?.owner && t?.tickLower === value?.tickLower && t?.tickUpper === value?.tickUpper)
      );
  }

  return { nftPositions, directPositions };
}

export async function fetchSwaps(
  chainId: MerklSupportedChainIdsType,
  pool: string,
  start: number,
  end: number,
  amm: AMMType,
  maxSwapsToConsider = 500
): Promise<SwapType<AMMAlgorithmType>[]> {
  const ammType = AMMAlgorithmMapping[amm];
  /**
   *  Swaps
   * @notice swaps feched from external (non Angle) subgraphs
   */
  const swapsEndpoint = !!swapsSubgraphsEndpoint[chainId][amm]
    ? swapsSubgraphsEndpoint[chainId][amm]
    : merklFallbackTGEndpoint[chainId][amm];
  const swapsData = await withRetry<any, { swaps: SwapType<typeof ammType>[] }>(request, [
    swapsEndpoint,
    swapQueryUniV3,
    {
      pool: pool,
      lTimestamp: start,
      uTimestamp: end,
      first: maxSwapsToConsider,
    },
  ]);
  const swaps = swapsData.swaps
    // .sort((a: SwapType, b: SwapType) => (a.timestamp < b.timestamp ? -1 : 1))
    .map((swap: SwapType<typeof ammType>) => {
      return {
        ...swap,
        amount0: swap.amount0.includes('-') ? swap.amount0.substring(1) : swap.amount0,
        amount1: swap.amount1.includes('-') ? swap.amount1.substring(1) : swap.amount1,
      };
    });
  return swaps;
}
/**
 * @dev Not used in the merkl dispute gist
 */
export const reportPositionAndSwap = async (
  chainId: MerklSupportedChainIdsType,
  amm: AMMType,
  pool: string,
  startTimestamp: number, // Cutoff to fetch positions
  endTimestamp: number, // To filter swaps
  swaps_number: number,
  subgraphMode: 'prod' | 'dev' | 'local' = 'prod'
) => {
  const provider = httpProvider(chainId);
  const poolContract = UniswapV3Pool__factory.connect(pool, provider);
  let sqrtPriceX96: string;
  let tick: number;
  let token0: string;
  let token1: string;
  let token0symbol: string;
  let token1symbol: string;
  const prices: PriceType = {};

  const name = await fetchPoolName(chainId, pool, amm);
  let token0Decimals: number;
  let token1Decimals: number;

  await Promise.all([
    poolContract.slot0().then((res) => {
      sqrtPriceX96 = res.sqrtPriceX96.toString();
      tick = res.tick;
    }),
    poolContract.token0().then((res) => {
      token0 = res;
    }),
    poolContract.token1().then((res) => {
      token1 = res;
    }),
    axios.get<{ rate: number; token: string }[]>('https://api.angle.money/v1/prices').then((res) => {
      res.data.forEach((p) => (prices[p.token] = p.rate));
    }),
  ]);
  await Promise.all([
    Erc20__factory.connect(token0, provider)
      .decimals()
      .then((res) => {
        token0Decimals = res;
      }),
    Erc20__factory.connect(token0, provider)
      .symbol()
      .then((res) => {
        token0symbol = res;
      }),
    Erc20__factory.connect(token1, provider)
      .decimals()
      .then((res) => {
        token1Decimals = res;
      }),
    Erc20__factory.connect(token0, provider)
      .symbol()
      .then((res) => {
        token1symbol = res;
      }),
  ]);

  console.table({ name: name, pool: pool, startTimestamp, endTimestamp, TVL_THRESHOLD: TVL_THRESHOLD, tick, sqrtPriceX96 });

  const { nftPositions, directPositions } = await fetchPositions(chainId, amm, pool, startTimestamp, subgraphMode);

  console.table(
    (await fetchSwaps(chainId, pool, startTimestamp, endTimestamp, amm))
      .map((pos) => {
        return { ...pos, transaction: pos.transaction.blockNumber };
      })
      .filter((_, index) => index < swaps_number)
  );

  const positions: {
    live: string;
    liquidity: string;
    id: number | 'DIRECT';
    owner: string;
    tickLower: number;
    tickUpper: number;
    inRange: boolean;
    tvl: number;
    amount0: number;
    amount1: number;
    propFee: number;
    propAmount0: number;
    propAmount1: number;
  }[] = [];

  let totalLiquidity = BigNumber.from(0);
  let totalAmount0 = 0;
  let totalAmount1 = 0;

  for (const p of nftPositions.concat(directPositions)) {
    const [amount0, amount1] = getAmountsForLiquidity(sqrtPriceX96, Number(p.tickLower), Number(p.tickUpper), BigNumber.from(p.liquidity));
    const live = Number(p.endTimestamp) === 0;
    const inRange = Number(p.tickLower) <= tick && tick < Number(p.tickUpper);

    if (live && inRange) {
      totalLiquidity = totalLiquidity.add(BigNumber.from(p.liquidity));
      totalAmount0 += Int256.from(amount0, token0Decimals).toNumber() ?? 0;
      totalAmount1 += Int256.from(amount1, token1Decimals).toNumber() ?? 0;
    }

    positions.push({
      live: live ? 'LIVE' : `CLOSED ${moment.unix(Number(p.endTimestamp)).format('MM-DD HH:mm:ss')}`,
      inRange,
      liquidity: p.liquidity,
      id: (p as any)?.id ? parseInt((p as any)?.id) : 'DIRECT',
      owner: p.owner,
      tickLower: Number(p.tickLower),
      tickUpper: Number(p.tickUpper),
      tvl:
        prices[token0symbol] * Int256.from(amount0, token0Decimals).toNumber() +
        prices[token1symbol] * Int256.from(amount1, token1Decimals).toNumber(),
      amount0: Int256.from(amount0, token0Decimals).toNumber(),
      amount1: Int256.from(amount1, token1Decimals).toNumber(),
      propFee: 0,
      propAmount0: 0,
      propAmount1: 0,
    });
  }

  // Normalizing
  console.table(
    positions
      .map((p) => {
        return {
          ...p,
          amount0: round(p.amount0, 2),
          amount1: round(p.amount1, 2),
          tvl: round(p.tvl, 2),
          liquidity: round(Number(p.liquidity), 2).toExponential(2),
          propFee: p.live && p.inRange ? round(Int256.from(p.liquidity, 0).mul(10000).div(totalLiquidity).toNumber() / 100, 2) : 0,
          propAmount0: p.live && p.inRange ? round((p.amount0 / totalAmount0) * 100, 2) : 0,
          propAmount1: p.live && p.inRange ? round((p.amount1 / totalAmount1) * 100, 2) : 0,
        };
      })
      .sort((a, b) => (a.tvl > b.tvl ? -1 : b.tvl > a.tvl ? 1 : 0))
  );
};

reportPositionAndSwap(chainId, amm, pool, startTimestamp, endTimestamp, swaps_number);
