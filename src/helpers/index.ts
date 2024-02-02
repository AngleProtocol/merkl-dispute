import { AMM, AMMAlgorithm, AMMAlgorithmMapping, Erc20__factory, Multicall__factory } from '@angleprotocol/sdk';

import { MULTICALL_ADDRESS } from '../constants';
import { httpProvider } from '../providers';
import { PoolInterface } from '../types';

export const fetchPoolName = async (chainId: number, pool: string, amm: AMM) => {
  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect(MULTICALL_ADDRESS, provider);
  const poolInterface = PoolInterface(AMMAlgorithmMapping[amm]);
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
    ...(AMMAlgorithmMapping[amm] === AMMAlgorithm.UniswapV3
      ? [
          {
            callData: poolInterface.encodeFunctionData('fee'),
            target: pool,
            allowFailure: false,
          },
        ]
      : []),
  ];
  let res = await multicall.callStatic.aggregate3(calls);
  let i = 0;
  const token0 = poolInterface.decodeFunctionResult('token0', res[i++].returnData)[0];
  const token1 = poolInterface.decodeFunctionResult('token1', res[i++].returnData)[0];
  let fee;
  if (AMMAlgorithmMapping[amm] === AMMAlgorithm.UniswapV3) {
    fee = poolInterface.decodeFunctionResult('fee', res[i].returnData)[0];
  }
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

  return `${AMM[amm]} ${token0Symbol}-${token1Symbol}-${fee ?? ``}`;
};

export const round = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;
