import {
  AMMType,
  ChainId,
  Erc20__factory,
  getAmountsForLiquidity,
  getMerklSubgraphPrefix,
  Int256,
  merklSubgraphAMMEndpoints,
  MerklSupportedChainIdsType,
  UniswapV3Pool__factory,
  withRetry,
} from '@angleprotocol/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber, constants } from 'ethers';
import { request } from 'graphql-request';

dotenv.config();

import { BATCH_NUMBER, TVL_THRESHOLD } from '../constants';
import { httpProvider } from '../providers';
import { directPositionsQuery, nftPositionsQuery } from './queries';

type PriceType = { [token: string]: number };
export declare type NFTManagerPositionType = {
  endTimestamp: number;
  id: string;
  liquidity: string;
  pool: string;
  tickLower: number;
  tickUpper: number;
  startTimestamp: number;
};
export declare type DirectPositionType = {
  endTimestamp: number;
  owner: string;
  startTimestamp: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
};

function computePositionTVL(
  poolTick: number,
  pos: NFTManagerPositionType | DirectPositionType,
  priceToken0: number,
  priceToken1: number,
  token0Decimals: number,
  token1Decimals: number
): number {
  const [amount0, amount1] = getAmountsForLiquidity(
    poolTick,
    parseFloat(pos.tickLower.toString()),
    parseFloat(pos.tickUpper.toString()),
    BigNumber.from(pos.liquidity)
  );
  return Int256.from(amount0, token0Decimals)?.toNumber() * priceToken0 + Int256.from(amount1, token1Decimals)?.toNumber() * priceToken1;
}

export async function fetchPositions(
  merklSubgraphPrefix: string,
  chainId: MerklSupportedChainIdsType,
  amm: AMMType,
  pool: string,
  startTimestamp: number
): Promise<{
  NFTManagerPositions: NFTManagerPositionType[];
  directPositions: DirectPositionType[];
  discordField: { name: string; value: string };
}> {
  const provider = httpProvider(chainId);
  const poolContract = UniswapV3Pool__factory.connect(pool, provider);
  let tick: number;
  let token0: string;
  let token1: string;
  let skipFiltering = false;
  let discordField: { value: string; name: string };
  const prices: PriceType = {};
  try {
    await Promise.all([
      poolContract.slot0().then((res) => {
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
  } catch (e) {
    discordField = { value: `Error fetching pool data: ${e}`, name: 'Error' };
    skipFiltering = true;
  }
  let token0Symbol: string;
  let token0Decimals: number;
  let token1Symbol: string;
  let token1Decimals: number;
  if (!skipFiltering) {
    try {
      await Promise.all([
        Erc20__factory.connect(token0, provider)
          .symbol()
          .then((res) => {
            token0Symbol = res;
          }),
        Erc20__factory.connect(token0, provider)
          .decimals()
          .then((res) => {
            token0Decimals = res;
          }),
        Erc20__factory.connect(token1, provider)
          .symbol()
          .then((res) => {
            token1Symbol = res;
          }),
        Erc20__factory.connect(token0, provider)
          .decimals()
          .then((res) => {
            token1Decimals = res;
          }),
      ]);
    } catch (e) {
      discordField = { value: `Error fetching token data ${e}`, name: 'Error' };
      skipFiltering = true;
    }
  }
  if (!prices?.[token0Symbol] || !prices?.[token1Symbol]) {
    discordField = { value: `Error fetching token prices for pair ${token0Symbol}/${token1Symbol}`, name: 'Error' };
    skipFiltering = true;
  }
  /**
   * Positions
   */
  let minLiquidityOpen = constants.MaxUint256.toString();
  let minLiquidityClosed = constants.MaxUint256.toString();
  // TODO @greedythib parallelize
  /**
   *  NFT positions
   */
  let isFullyFetched = false;
  let nftManagerPositionsTmp: NFTManagerPositionType[] = [];
  while (!isFullyFetched) {
    const nftPositionsData = await withRetry<
      any,
      {
        openPositions: NFTManagerPositionType[];
        closedPositions: NFTManagerPositionType[];
      }
    >(request, [
      merklSubgraphAMMEndpoints(merklSubgraphPrefix)[chainId][amm],
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

    const fetchedNFTPositions = nftPositionsData?.openPositions
      .concat(nftPositionsData?.closedPositions)
      .filter((value, index, self) => index === self.findIndex((t) => value.id === t.id));

    nftManagerPositionsTmp = nftManagerPositionsTmp
      .concat(fetchedNFTPositions)
      .filter((value, index, self) => index === self.findIndex((t) => t === value));
  }
  /** Remove block number from nft manager data */
  const NFTManagerPositions = nftManagerPositionsTmp.filter((pos) => {
    if (!skipFiltering) {
      return computePositionTVL(tick, pos, prices[token0Symbol], prices[token1Symbol], token0Decimals, token1Decimals) >= TVL_THRESHOLD;
    } else {
      return true;
    }
  });
  let directPositions: DirectPositionType[] = [];
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
        openPositions: DirectPositionType[];
        closedPositions: DirectPositionType[];
      }
    >(request, [
      merklSubgraphAMMEndpoints(merklSubgraphPrefix)[chainId][amm],
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

    const fetchedDirectPositions = directPositionsData?.openPositions
      .concat(directPositionsData.closedPositions)
      .map((position) => {
        return {
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
  if (!skipFiltering) {
    directPositions.filter(
      (pos) => computePositionTVL(tick, pos, prices[token0Symbol], prices[token1Symbol], token0Decimals, token1Decimals) >= TVL_THRESHOLD
    );
  }
  return { NFTManagerPositions, directPositions, discordField };
}

const merklSubgraphPrefix = getMerklSubgraphPrefix('prod');
const chainId: ChainId = ChainId.MAINNET;
const amm: AMMType = AMMType.UniswapV3;
const pool = '0x8dB1b906d47dFc1D84A87fc49bd0522e285b98b9'.toLowerCase();
const startTimestamp = 1688221472;
(async () => {
  console.table({ pool: pool, startTimestamp: startTimestamp, TVL_THRESHOLD: TVL_THRESHOLD });
  const { NFTManagerPositions, directPositions } = await fetchPositions(merklSubgraphPrefix, chainId, amm, pool, startTimestamp);
  console.log('################## NFTManagerPositions ##################');
  console.table(NFTManagerPositions);
  console.log('################## directPositions ##################');
  console.table(directPositions);
})();
