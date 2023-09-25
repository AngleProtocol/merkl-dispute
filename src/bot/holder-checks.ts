import { AggregatedRewardsType, Int256 } from '@angleprotocol/sdk';
import { BigNumber } from 'ethers';

import { DisputeContext } from './context';
import { DisputeState } from './run';
import { round } from '../helpers';
import { ERROR_TREE_NEGATIVE_DIFF } from './errors';

function gatherHolders(startTree: AggregatedRewardsType, endTree: AggregatedRewardsType): any[] {
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

  return holders;
}

export type HolderDetail = {
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
};

export type HolderClaims = { [address: string]: { [symbol: string]: string } };

export type DistributionChange = {
  diff: number;
  symbol: string;
  poolName: string;
  pool: any;
  recipients: number;
  ratePerEpoch: number;
  epoch: number;
};

export type DistributionChanges = { [address: string]: DistributionChange };

export default async function checkHoldersDiffs(
  context: DisputeContext,
  startTree: AggregatedRewardsType,
  endTree: AggregatedRewardsType,
  processDetails?: (details: HolderDetail[], changePerDistrib: DistributionChanges) => void
): Promise<DisputeState> {
  const { onChainProvider } = context;

  const holders = gatherHolders(startTree, endTree);
  let details: HolderDetail[] = [];

  const activeDistributions = await onChainProvider.fetchActiveDistributions(context.blockNumber);

  const changePerDistrib: DistributionChanges = {};
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
        if (diff < 0)
          return {
            error: true,
            code: ERROR_TREE_NEGATIVE_DIFF,
            reason: `Holder ${holder} has negative diff for ${symbol}`,
          };
        const diffBoost =
          Number(endTree?.rewards?.[k]?.holders?.[holder]?.averageBoost) ??
          0 - Number(startTree?.rewards?.[k]?.holders?.[holder]?.averageBoost) ??
          0;

        if (!poolName[pool]) {
          try {
            poolName[pool] = await onChainProvider.fetchPoolName(pool, endTree?.rewards?.[k]?.amm, context.blockNumber);
          } catch (err) {
            console.log('err fetching poolName', err);
          }
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

  const alreadyClaimed: HolderClaims = await onChainProvider.fetchClaimed(details);

  let error = false;
  let reason = '';
  let code = -1;

  // Sort details by distribution and format numbers
  details = await Promise.all(
    details
      .sort((a, b) =>
        a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : a.percent > b.percent ? -1 : b.percent > a.percent ? 1 : 0
      )
      .map(async (d) => {
        const alreadyClaimedValue = round(Int256.from(alreadyClaimed[d.holder][d.tokenAddress], d.decimals).toNumber(), 2);
        const totalCumulated = round(unclaimed[d.holder][d.symbol].toNumber(), 2);
        if (totalCumulated < alreadyClaimedValue) {
          error = true;
          code = ERROR_TREE_NEGATIVE_DIFF,
          reason = `Holder ${d.holder} received ${totalCumulated} although he already claimed ${alreadyClaimedValue}`;
        }
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

  processDetails && processDetails(details, changePerDistrib);

  // overridenConsole.table(details, [
  //   'holder',
  //   'diff',
  //   'symbol',
  //   'poolName',
  //   'distribution',
  //   'percent',
  //   'diffAverageBoost',
  //   'totalCumulated',
  //   'alreadyClaimed',
  //   'issueSpotted',
  // ]);

  // overridenConsole.table(
  //   Object.keys(changePerDistrib)
  //     .map((k) => {
  //       return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
  //     })
  //     .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
  // );

  return { error, code, reason };
}
