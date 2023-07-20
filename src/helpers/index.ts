import { AMMType, Erc20__factory, UniswapV3Pool__factory } from '@angleprotocol/sdk';

import { httpProvider } from '../providers';

export const fetchPoolName = async (chainId: number, pool: string, amm: AMMType) => {
  const provider = httpProvider(chainId);
  const poolContract = UniswapV3Pool__factory.connect(pool, provider);

  const token0 = await Erc20__factory.connect(await poolContract.token0(), provider).symbol();
  const token1 = await Erc20__factory.connect(await poolContract.token1(), provider).symbol();
  const fees = await poolContract.fee();

  return `${AMMType[amm]} ${token0}-${token1}-${fees}`;
};

export const round = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;

export declare type PositionType = {
  endTimestamp: number;
  owner: string;
  startTimestamp: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
};

export type SwapType = {
  amount0: string;
  amount1: string;
  amountUSD: string;
  tick: string;
  sqrtPriceX96: string;
  timestamp: string;
  transaction: { blockNumber: string };
};
