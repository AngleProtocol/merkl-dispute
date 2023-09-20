import 'dotenv/config';

import { ChainId, EnvType, MerklSupportedChainIdsType, Multicall, withRetry } from '@angleprotocol/sdk';
import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import { Octokit } from '@octokit/rest';
import axios from 'axios';
import { BytesLike, constants } from 'ethers';

import { MAX_NUM_SUBCALLS } from '../constants';
import { httpProvider } from '../providers';

export function getEnv(): EnvType {
  const value = process.env['ENV'] as EnvType;
  if (!value) {
    throw new Error(`❌ Missing environment variable ENV`);
  }
  return value;
}

export function getChainId(): ChainId {
  const value = process.env['CHAINID'];
  if (!value) {
    throw new Error(`❌ Missing environment variable CHAINID`);
  }
  return parseInt(value) as ChainId;
}

const octokit = new Octokit({ auth: process.env.KEEPER_GITHUB_AUTH_TOKEN });
export async function createGist(description: string, content: string): Promise<string> {
  const response = await octokit.gists.create({
    files: {
      'diff.txt': {
        content: content,
      },
    },
    description,
    public: false,
  });
  return response.data.html_url;
}

export async function retryWithExponentialBackoff<T>(fn: (...any) => Promise<T>, retries = 5, delay = 500, ...args): Promise<T> {
  try {
    const result = await fn(...args);
    return result;
  } catch (error) {
    if (retries === 0) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithExponentialBackoff(fn, retries - 1, delay * 2, ...args);
  }
}

export async function multicallContractCall(
  contract: Multicall,
  args: { data: Multicall3.Call3Struct[]; blockNumber?: number; from: string }
): Promise<string[]> {
  let result: BytesLike;
  try {
    // TO SIMULATE - USE CAUTIOUSLY AS IT USES CREDITS
    // console.log(
    //   await callTenderly(
    //     {
    //       chainId: (await contract.provider.getNetwork()).chainId.toString(),
    //       data: contract.interface.encodeFunctionData('aggregate', [args.data]),
    //       from: !!args.from ? args.from : constants.AddressZero,
    //       saveSimulation: true,
    //       to: contract.address,
    //       value: '0',
    //     },
    //     undefined,
    //     true
    //   )
    // );
    result = await contract.provider.call(
      {
        data: contract.interface.encodeFunctionData('aggregate3', [
          args.data.map((c) => {
            return {
              allowFailure: !!c.allowFailure,
              callData: c.callData,
              target: c.target,
            };
          }),
        ]),
        from: !!args.from ? args.from : constants.AddressZero,
        to: contract.address,
      },
      !!args.blockNumber ? args.blockNumber : null
    );
  } catch {
    throw new Error('❌ failed to decode multicall data');
  }
  return contract.interface.decodeFunctionResult('aggregate3', result)[0].map((r) => r?.returnData);
}

export async function batchMulticallCall(
  func: (contract: Multicall, args: { data: Multicall3.Call3Struct[]; blockNumber?: number | string }) => Promise<string[]>,
  contract: Multicall,
  args: { data: any[]; blockNumber?: number },
  shouldRetry = true
): Promise<string[]> {
  let fetchedData = [];
  let callsLeft = args.data.length;
  let lowerIdx = 0;
  let upperIdx = Math.min(args.data.length, MAX_NUM_SUBCALLS);
  const multicallBatch = [];
  while (callsLeft !== 0) {
    multicallBatch.push(
      shouldRetry
        ? withRetry(func, [
            contract,
            {
              blockNumber: args.blockNumber,
              data: args.data.slice(lowerIdx, upperIdx),
            },
          ])
        : func(contract, args)
    );
    callsLeft -= upperIdx - lowerIdx;
    lowerIdx = upperIdx;
    upperIdx = Math.min(args.data.length, upperIdx + MAX_NUM_SUBCALLS);
  }
  /** Executing batched multicall */
  const results = await Promise.allSettled(multicallBatch);
  for (let k = 0; k < results.length; k++) {
    const res = results[k];
    if (res.status === 'fulfilled') {
      fetchedData = fetchedData.concat(res.value);
    }
  }
  return fetchedData;
}

/** @dev Any block between the timestamp and 1 min after is suitable  */
export async function getBlockAfterTimestamp(chainId: ChainId, timestamp: number): Promise<number> {
  const provider = httpProvider(chainId);
  let lowerBound = 0;
  let upperBound = await provider.getBlockNumber();

  while (lowerBound <= upperBound) {
    const mid = Math.floor((upperBound + lowerBound) / 2);
    const block = await provider.getBlock(mid);

    if (block.timestamp <= timestamp) {
      lowerBound = mid + 1;
    } else {
      upperBound = mid - 1;
    }

    if (timestamp <= block.timestamp && timestamp + 60 >= block.timestamp) {
      return block.number;
    }
  }

  // Once the loop finishes, lowerBound points to the nearest block after the timestamp.
  return (await provider.getBlock(lowerBound)).number;
}
