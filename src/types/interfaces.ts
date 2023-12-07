import { AlgebraV19Pool__factory, AMMAlgorithm, UniswapV3Pool__factory } from '@angleprotocol/sdk';
import { Interface } from '@ethersproject/abi';

export const PoolInterface = (AMM: AMMAlgorithm): Interface => {
  if (AMM === AMMAlgorithm.AlgebraV1_9) {
    return AlgebraV19Pool__factory.createInterface();
  } else if (AMM === AMMAlgorithm.UniswapV3) {
    return UniswapV3Pool__factory.createInterface();
  } else if (AMM === AMMAlgorithm.BaseX) {
    return;
  } else throw new Error('Invalid AMM type');
};
