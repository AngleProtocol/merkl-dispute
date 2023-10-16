import { AggregatedRewardsType, AMMType } from '@angleprotocol/sdk';
import {
  DistributionParametersStructOutput,
  ExtensiveDistributionParametersStructOutput,
  UniswapTokenDataStructOutput,
} from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { BigNumber } from 'ethers';

import { HolderClaims } from '../../src/types/holders';

export const createTree = (amount: string) => {
  const defaultTree: AggregatedRewardsType = {
    rewards: {
      pesos: {
        amm: AMMType.UniswapV3,
        ammAlgo: 'UniswapV3',
        boostedAddress: '0xbac10c87B134742D15dA0F8db7Ee252Ce7318534',
        boostedReward: 1,
        holders: {
          '0xcaca6fE7DCD4BbA6053640Bf883bCA19d6d0eB82': {
            amount,
            averageBoost: 0,
          },
        },
        lastUpdateEpoch: 1,
        pool: 'PESOS-STERLING',
        tokenSymbol: 'REWARDS',
        tokenDecimals: 18,
        token: '0xbac10c87B134742D15dA0F8db7Ee252Ce7318534',
        totalAmount: '0',
      },
    },
    updateTimestamp: 1,
    lastUpdateEpoch: 0,
    merklRoot: 'root',
  };

  return { ...defaultTree };
};

export const createActiveDistribution = () => {
  const distribution: ExtensiveDistributionParametersStructOutput = {
    base: {
      rewardId: 'string',
      uniV3Pool: 'string',
      rewardToken: 'string',
      amount: BigNumber.from(0),
      positionWrappers: ['string'],
      wrapperTypes: [0],
      propToken0: 0,
      propToken1: 0,
      propFees: 0,
      epochStart: 0,
      numEpoch: 0,
      isOutOfRangeIncentivized: 0,
      boostedReward: 0,
      boostingAddress: 'string',
      additionalData: 'string',
    } as DistributionParametersStructOutput,
    poolFee: 1,
    token0: {
      add: 'string',
      decimals: 18,
      symbol: 'PESOS',
      poolBalance: BigNumber.from(0),
    } as UniswapTokenDataStructOutput,
    token1: {
      add: 'string',
      decimals: 18,
      symbol: 'PESOS',
      poolBalance: BigNumber.from(0),
    } as UniswapTokenDataStructOutput,
    rewardTokenSymbol: 'REWARDS',
    rewardTokenDecimals: 18,
  } as ExtensiveDistributionParametersStructOutput;

  return [distribution];
};

export const createClaims = (amount: string) => {
  const claims: HolderClaims = {
    '0xcaca6fE7DCD4BbA6053640Bf883bCA19d6d0eB82': {
      REWARDS: amount,
    },
  };

  return claims;
};
