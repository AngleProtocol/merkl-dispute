import {
  AggregatedRewardsType,
  ChainId,
  DistributionCreator__factory,
  Distributor__factory,
  Int256,
  Multicall__factory,
  registry,
} from '@angleprotocol/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber } from 'ethers';

import endJson from './jsons/end.json';
import startJson from './jsons/start.json';

dotenv.config();

import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import console from 'console';

import { GITHUB_URL } from '../constants';
import { buildMerklTree, fetchPoolName, round } from '../helpers';
import { httpProvider } from '../providers';
import { MerklIndexType } from '../routes';
import { batchMulticallCall, multicallContractCall, retryWithExponentialBackoff } from '../utils';

export type ReportDiffParams =
  | {
      MODE: 'LOCAL';
    }
  | {
      MODE: 'LAST';
    }
  | {
      MODE: 'TIMESTAMP';
      startTimestamp: number;
      endTimestamp: number;
    }
  | {
      MODE: 'ROOTS';
      startRoot: string;
      endRoot: string;
    };

export const reportDiff = async (
  chainId: ChainId,
  params: ReportDiffParams,
  overridenConsole: typeof console = console
): Promise<{ error: boolean; reason: string }> => {
  let error = false;
  let reason = '';
  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', provider);
  const distributorInterface = Distributor__factory.createInterface();

  let startTree: AggregatedRewardsType;
  let endTree: AggregatedRewardsType;

  if (params.MODE === 'LAST') {
    const contract = Distributor__factory.connect(registry(chainId).Merkl.Distributor, provider);
    params = {
      MODE: 'ROOTS',
      startRoot: (await contract.lastTree()).merkleRoot,
      endRoot: (await contract.tree()).merkleRoot,
    };
  }

  // ONLY THE ROOTS MODE NEEDS TO BE FULLY SAFE
  if (params.MODE === 'TIMESTAMP') {
    if (params.startTimestamp > params.endTimestamp) {
      throw 'Start timestamp is after end timestamp';
    }

    const call = await axios.get<MerklIndexType>(GITHUB_URL + `${chainId + `/index.json`}`, {
      timeout: 5000,
    });
    const merklIndex = call.data;
    /**
     * Rounds down timestamp to the last reward computation
     */
    let startEpoch = Math.floor(params.startTimestamp / 3600);
    while (!Object.values(merklIndex).includes(startEpoch)) {
      startEpoch -= 1;
    }
    let endEpoch = Math.floor(params.endTimestamp / 3600);
    while (!Object.values(merklIndex).includes(endEpoch)) {
      endEpoch -= 1;
    }
    startTree = (
      await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${startEpoch}.json`}`, {
        timeout: 5000,
      })
    ).data;
    endTree = (
      await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${endEpoch}.json`}`, {
        timeout: 5000,
      })
    ).data;

    overridenConsole.log(`Comparing ${startEpoch} and ${endEpoch} jsons`);
  } else if (params.MODE === 'ROOTS') {
    let merklIndex;

    try {
      await retryWithExponentialBackoff(async () => {
        return await axios.get<MerklIndexType>(GITHUB_URL + `${chainId + `/index.json`}`, {
          timeout: 25_000,
        });
      }).then((r) => (merklIndex = r.data));
    } catch {
      error = true;
      reason = `Couldn't find index on Github`;
      return { error, reason };
    }

    const startEpoch = merklIndex[params.startRoot];
    const endEpoch = merklIndex[params.endRoot];

    try {
      await retryWithExponentialBackoff(async () => {
        return await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${startEpoch}.json`}`, {
          timeout: 25_000,
        });
      }).then((r) => (startTree = r.data));
    } catch {
      error = true;
      reason = `Couldn't find json corresponding to ${params.startRoot} on Github`;
      return { error, reason };
    }

    try {
      await retryWithExponentialBackoff(async () => {
        return await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${endEpoch}.json`}`, {
          timeout: 25_000,
        });
      }).then((r) => (endTree = r.data));
    } catch {
      error = true;
      reason = `Couldn't find json corresponding to ${params.endRoot} on Github`;
      return { error, reason };
    }
  } else {
    startTree = startJson as unknown as AggregatedRewardsType;
    endTree = endJson as unknown as AggregatedRewardsType;
  }

  /** Roots reconciliations */
  const root = buildMerklTree(endTree.rewards).tree.getHexRoot();
  if (root !== endTree.merklRoot) {
    error = true;
    reason = `End tree merkl root is not correct`;
    return { error, reason };
  }

  const startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();
  if (startRoot !== startTree.merklRoot) {
    error = true;
    reason = `Start tree merkl root is not correct`;
    return { error, reason };
  }

  const holders = [];
  for (const d of Object.values(startTree.rewards)) {
    for (const h of Object.keys(d.holders)) {
      if (!holders.includes(h)) {
        holders.push(h);
      }
    }
  }
  for (const d of Object.values(endTree.rewards)) {
    for (const h of Object.keys(d.holders)) {
      if (!holders.includes(h)) {
        holders.push(h);
      }
    }
  }

  let activeDistributions: ExtensiveDistributionParametersStructOutput[];
  try {
    activeDistributions = await DistributionCreator__factory.connect(
      registry(chainId).Merkl.DistributionCreator,
      provider
    ).getActiveDistributions();
  } catch {}

  // The goal will be to fill this for every holder
  let details: {
    holder: string;
    diff: number;
    symbol: string;
    poolName: string;
    distribution: string;
    percent?: number;
    diffAverageBoost?: number;
    decimals?: number;
    tokenAddress?: string;
    issueSpotted?: boolean;
  }[] = [];
  const changePerDistrib = {};
  const poolName = {};
  const unclaimed: { [address: string]: { [symbol: string]: Int256 } } = {};

  for (const holder of holders) {
    unclaimed[holder] = {};
    for (const k of Object.keys(endTree.rewards)) {
      const symbol = endTree?.rewards?.[k].tokenSymbol;
      const decimals = endTree?.rewards?.[k].tokenDecimals;
      const pool = endTree?.rewards?.[k]?.pool;

      if (!unclaimed[holder]) unclaimed[holder] = {};
      if (!unclaimed[holder][symbol]) {
        unclaimed[holder][symbol] = Int256.from(endTree?.rewards?.[k]?.holders?.[holder]?.amount ?? 0, decimals);
      } else {
        unclaimed[holder][symbol] = unclaimed[holder][symbol].add(
          Int256.from(endTree?.rewards?.[k]?.holders?.[holder]?.amount ?? 0, decimals)
        );
      }
      if (startTree?.rewards?.[k]?.holders?.[holder]?.amount !== endTree?.rewards?.[k]?.holders?.[holder]?.amount) {
        const diff = Int256.from(
          BigNumber.from(endTree?.rewards?.[k]?.holders?.[holder]?.amount ?? 0).sub(
            startTree?.rewards?.[k]?.holders?.[holder]?.amount ?? 0
          ),
          decimals
        ).toNumber();
        if (diff < 0) {
          console.log('ERROR DETECTED FOR ', poolName[pool], holder);
          console.log('end: ', holder, endTree?.rewards?.[k]?.holders?.[holder]?.amount);
          console.log('start: ', holder, startTree?.rewards?.[k]?.holders?.[holder]?.amount);
          console.log('');
          error = true;
          reason = `Holder ${holder} has negative diff for ${symbol}`;
        }
        const diffBoost =
          Number(endTree?.rewards?.[k]?.holders?.[holder]?.averageBoost) ??
          0 - Number(startTree?.rewards?.[k]?.holders?.[holder]?.averageBoost) ??
          0;

        if (!poolName[pool]) {
          try {
            poolName[pool] = await fetchPoolName(chainId, pool, endTree?.rewards?.[k]?.amm);
          } catch {}
        }
        let ratePerEpoch;
        try {
          const solidityDist = activeDistributions?.find((d) => d.base.rewardId === k);
          ratePerEpoch = Int256.from(solidityDist?.base?.amount ?? 0, decimals)?.toNumber() / solidityDist?.base?.numEpoch;
        } catch {
          ratePerEpoch = 1;
        }
        changePerDistrib[k] = {
          diff: (changePerDistrib[k]?.diff ?? 0) + diff,
          symbol,
          poolName: poolName[pool],
          pool,
          recipients: (changePerDistrib[k]?.recipients ?? 0) + 1,
          ratePerEpoch,
          epoch: (changePerDistrib[k]?.epoch ?? 0) + diff / ratePerEpoch,
        };
        details.push({
          holder,
          decimals,
          diff,
          diffAverageBoost: diffBoost,
          symbol,
          poolName: poolName[pool],
          distribution: k,
          tokenAddress: endTree?.rewards?.[k].token,
        });
      }
    }
  }

  for (const l of details) {
    l.percent = (l?.diff / changePerDistrib[l?.distribution]?.diff) * 100;
  }

  const alreadyClaimed: { [address: string]: { [symbol: string]: string } } = {};

  const calls: Multicall3.Call3Struct[] = [];
  for (const d of details) {
    if (!alreadyClaimed[d.holder]) alreadyClaimed[d.holder] = {};
    if (!alreadyClaimed[d.holder][d.tokenAddress]) {
      alreadyClaimed[d.holder][d.tokenAddress] = 'PENDING';
      calls.push({
        callData: distributorInterface.encodeFunctionData('claimed', [d.holder, d.tokenAddress]),
        target: registry(chainId).Merkl.Distributor,
        allowFailure: false,
      });
    }
  }
  const res = await batchMulticallCall(multicallContractCall, multicall, { data: calls });
  let decodingIndex = 0;
  for (const d of details) {
    if (alreadyClaimed[d.holder][d.tokenAddress] === 'PENDING') {
      alreadyClaimed[d.holder][d.tokenAddress] = distributorInterface.decodeFunctionResult('claimed', res[decodingIndex++])[0];
    }
  }

  // Sort details by distribution and format numbers
  details = await Promise.all(
    details
      .sort((a, b) =>
        a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : a.percent > b.percent ? -1 : b.percent > a.percent ? 1 : 0
      )
      .map(async (d) => {
        const alreadyClaimedValue = round(Int256.from(alreadyClaimed[d.holder][d.tokenAddress], d.decimals).toNumber(), 2);
        const totalCumulated = round(unclaimed[d.holder][d.symbol].toNumber(), 2);
        // if (totalCumulated < alreadyClaimedValue) {
        //   error = true;
        //   reason = `Holder ${d.holder} received ${totalCumulated} although he already claimed ${alreadyClaimedValue}`;
        // }
        return {
          ...d,
          diff: round(d.diff, 2),
          percent: round(d.percent, 2),
          averageBoost: round(d.diffAverageBoost, 2),
          distribution: d.distribution.slice(0, 5),
          totalCumulated,
          alreadyClaimed: alreadyClaimedValue,
          issueSpotted: totalCumulated < alreadyClaimedValue,
        };
      })
  );
  overridenConsole.table(details, [
    'holder',
    'diff',
    'symbol',
    'poolName',
    'distribution',
    'percent',
    'diffAverageBoost',
    'totalCumulated',
    'alreadyClaimed',
    'issueSpotted',
  ]);

  overridenConsole.table(
    Object.keys(changePerDistrib)
      .map((k) => {
        return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
      })
      .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
  );

  return { error, reason };
};
