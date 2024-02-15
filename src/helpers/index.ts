import {
  AggregatedRewardsType,
  AMM,
  AMMAlgorithm,
  AMMAlgorithmMapping,
  Erc20__factory,
  Multicall__factory,
  UnderlyingTreeType,
} from '@angleprotocol/sdk';
import { BigNumber, ethers, utils } from 'ethers';
import keccak256 from 'keccak256';
import MerkleTree from 'merkletreejs';

import { MERKL_TREE_OPTIONS, MULTICALL_ADDRESS } from '../constants';
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

export const buildMerklTree = (
  underylingTreeData: UnderlyingTreeType
): {
  tree: MerkleTree;
} => {
  /**
   * 1 - Build the global list of users
   */
  const users: string[] = [];
  for (const id of Object.keys(underylingTreeData)) {
    const rewardUsers = Object.keys(underylingTreeData[id].holders);
    for (const r of rewardUsers) {
      if (!users.includes(r)) {
        users.push(r);
      }
    }
  }

  /**
   * 2 - Build the global list of tokens
   */
  const tokens: string[] = tokensFromTree(underylingTreeData);

  /**
   * 3 - Build the tree
   */
  const leaves = [];
  for (const u of users) {
    for (const t of tokens) {
      let sum = BigNumber.from(0);
      for (const id of Object.keys(underylingTreeData)) {
        const distribution = underylingTreeData[id];
        if (distribution.token === t) {
          sum = sum?.add(distribution?.holders[u]?.amount.toString() ?? 0);
        }
      }
      if (!!sum && sum.gt(0)) {
        const hash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256'], [utils.getAddress(u), t, sum])
        );
        leaves.push(hash);
      }
    }
  }
  const tree = new MerkleTree(leaves, keccak256, MERKL_TREE_OPTIONS);

  return {
    tokens,
    tree,
  };
};

export const tokensFromTree = (json: AggregatedRewardsType['rewards']): string[] => {
  const tokens: string[] = [];
  for (const id of Object.keys(json)) {
    if (!tokens.includes(json[id].token)) {
      tokens.push(json[id].token);
    }
  }
  return tokens;
};
