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

import console from 'console';

import { GITHUB_URL } from '../constants';
import { fetchPoolName, round } from '../helpers';
import { httpProvider } from '../providers';
import { MerklIndexType } from '../routes';
import { retryWithExponentialBackoff } from '../utils';

export const reportDiff = async (
  chainId: ChainId,
  params:
    | {
        MODE: 'LOCAL';
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
      },
  overridenConsole: typeof console = console
): Promise<{ error: boolean; reason: string }> => {
  let error = false;
  let reason = '';
  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', provider);
  const distributorInterface = Distributor__factory.createInterface();

  let startTree: AggregatedRewardsType;
  let endTree: AggregatedRewardsType;

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
          timeout: 5000,
        });
      }).then((r) => (merklIndex = r.data));
    } catch {
      error = true;
      reason = `Couldn't find index on Github`;
    }

    const startEpoch = merklIndex[params.startRoot];
    const endEpoch = merklIndex[params.endRoot];

    try {
      await retryWithExponentialBackoff(async () => {
        return await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${startEpoch}.json`}`, {
          timeout: 5000,
        });
      }).then((r) => (startTree = r.data));
    } catch {
      error = true;
      reason = `Couldn't find json corresponding to ${params.startRoot} on Github`;
    }

    try {
      await retryWithExponentialBackoff(async () => {
        return await axios.get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/backup/rewards_${endEpoch}.json`}`, {
          timeout: 5000,
        });
      }).then((r) => (endTree = r.data));
    } catch {
      error = true;
      reason = `Couldn't find json corresponding to ${params.endRoot} on Github`;
    }
  } else {
    startTree = startJson as unknown as AggregatedRewardsType;
    endTree = endJson as unknown as AggregatedRewardsType;
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

  let activeDistributions;
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
          error = true;
          reason = `Holder ${holder} has negative diff for ${symbol}`;
        }

        if (!poolName[pool]) {
          poolName[pool] = await fetchPoolName(chainId, pool, endTree?.rewards?.[k]?.amm);
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

  const calls = [];
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
  const res = await multicall.callStatic.aggregate3(calls);
  let decodingIndex = 0;
  for (const d of details) {
    if (alreadyClaimed[d.holder][d.tokenAddress] === 'PENDING') {
      alreadyClaimed[d.holder][d.tokenAddress] = distributorInterface.decodeFunctionResult('claimed', res[decodingIndex++].returnData)[0];
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
        return {
          ...d,
          diff: round(d.diff, 2),
          percent: round(d.percent, 2),
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
