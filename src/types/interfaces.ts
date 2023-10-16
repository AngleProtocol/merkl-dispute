import { AlgebraV19Pool__factory, AMMAlgorithmType, UniswapV3Pool__factory } from '@angleprotocol/sdk';
import { Interface } from '@ethersproject/abi';

export const PoolInterface = (ammType: AMMAlgorithmType): Interface => {
  if (ammType === AMMAlgorithmType.AlgebraV1_9) {
    return AlgebraV19Pool__factory.createInterface();
  } else if (ammType === AMMAlgorithmType.UniswapV3) {
    return UniswapV3Pool__factory.createInterface();
  } else if (ammType === AMMAlgorithmType.BaseX) {
    return;
  } else throw new Error('Invalid AMM type');
};
