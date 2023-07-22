import { AMMType, Erc20__factory, Multicall__factory, UniswapV3Pool__factory } from '@angleprotocol/sdk';

import { httpProvider } from '../providers';

export const fetchPoolName = async (chainId: number, pool: string, amm: AMMType) => {
  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', provider);
  const poolInterface = UniswapV3Pool__factory.createInterface();
  const erc20Interface = Erc20__factory.createInterface();

  let calls = [
    {
      callData: poolInterface.encodeFunctionData('token0'),
      target: pool,
      allowFailure: false,
    },
    {
      callData: poolInterface.encodeFunctionData('token1'),
      target: pool,
      allowFailure: false,
    },
    {
      callData: poolInterface.encodeFunctionData('fee'),
      target: pool,
      allowFailure: false,
    },
  ];
  let res = await multicall.callStatic.aggregate3(calls);
  const token0 = poolInterface.decodeFunctionResult('token0', res[0].returnData)[0];
  const token1 = poolInterface.decodeFunctionResult('token1', res[1].returnData)[0];
  const fee = poolInterface.decodeFunctionResult('fee', res[2].returnData)[0];

  calls = [
    {
      callData: erc20Interface.encodeFunctionData('symbol'),
      target: token0,
      allowFailure: false,
    },
    {
      callData: erc20Interface.encodeFunctionData('symbol'),
      target: token1,
      allowFailure: false,
    },
  ];
  res = await multicall.callStatic.aggregate3(calls);
  const token0Symbol = erc20Interface.decodeFunctionResult('symbol', res[0].returnData)[0];
  const token1Symbol = erc20Interface.decodeFunctionResult('symbol', res[1].returnData)[0];

  return `${AMMType[amm]} ${token0Symbol}-${token1Symbol}-${fee}`;
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
