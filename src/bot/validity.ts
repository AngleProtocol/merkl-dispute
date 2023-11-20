import { AggregatedRewardsType, Int256 } from '@angleprotocol/sdk';
import { BigNumber } from 'ethers';

import { HOUR } from '../constants';
import { round } from '../helpers';
import OnChainProvider from '../providers/on-chain/OnChainProvider';
import { DistributionChanges, HolderClaims, HolderDetail, HoldersReport, UnclaimedRewards } from '../types/holders';

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

export async function validateHolders(
  onChainProvider: OnChainProvider,
  startTree: AggregatedRewardsType,
  endTree: AggregatedRewardsType
): Promise<HoldersReport> {
  const holders = gatherHolders(startTree, endTree);
  const activeDistributions = await onChainProvider.fetchActiveDistributionsBetween(
    startTree.lastUpdateEpoch * HOUR,
    endTree.lastUpdateEpoch * HOUR
  );
  const activeDistributionsObject = {};
  for (const dist of activeDistributions) {
    activeDistributionsObject[dist.base.rewardId] = dist;
  }

  const poolName = {};

  const details: HolderDetail[] = [];
  const changePerDistrib: DistributionChanges = {};
  const unclaimed: UnclaimedRewards = {};
  const negativeDiffs: string[] = [];
  const overDistributed: string[] = [];

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
        if (diff < 0) negativeDiffs.push(`${holder}: ${diff.toFixed(2)} ${symbol}`);
        const diffBoost =
          Number(endTree?.rewards?.[k]?.holders?.[holder]?.averageBoost) ??
          0 - Number(startTree?.rewards?.[k]?.holders?.[holder]?.averageBoost) ??
          0;

        if (!poolName[pool]) {
          try {
            poolName[pool] = await onChainProvider.fetchPoolName(pool, endTree?.rewards?.[k]?.amm);
          } catch (err) {
            console.log(`Error fetching poolName ${poolName[pool]} (${pool}):${endTree?.rewards?.[k]?.amm}`, err);
          }
        }
        let ratePerEpoch;
        try {
          const solidityDist = activeDistributionsObject[k];
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

  for (const k of Object.keys(changePerDistrib)) {
    const solidityDist = activeDistributionsObject[k];

    // Either the distributed amount is less than what would be distributed since the distrib start and there is no dis in the start tree
    // Either it's less than what would be distributed since the startTree update
    if (
      (!!startTree.rewards[k]?.lastUpdateEpoch &&
        changePerDistrib[k].epoch > endTree.rewards[k].lastUpdateEpoch - startTree.rewards[k].lastUpdateEpoch) ||
      (!startTree.rewards[k]?.lastUpdateEpoch &&
        changePerDistrib[k].epoch > endTree.rewards[k].lastUpdateEpoch - solidityDist?.base?.epochStart / HOUR)
    ) {
      overDistributed.push(k);
    }
  }

  return { details, changePerDistrib, unclaimed, negativeDiffs, overDistributed };
}

export async function validateClaims(onChainProvider: OnChainProvider, holdersReport: HoldersReport): Promise<HoldersReport> {
  const { details, unclaimed } = holdersReport;
  const alreadyClaimed: HolderClaims = await onChainProvider.fetchClaimed(details);

  const overclaimed: string[] = [];

  // Sort details by distribution and format numbers
  const expandedDetails = await Promise.all(
    details
      .sort((a, b) =>
        a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : a.percent > b.percent ? -1 : b.percent > a.percent ? 1 : 0
      )
      .map(async (d) => {
        const alreadyClaimedValue = round(Int256.from(alreadyClaimed[d.holder][d.tokenAddress], d.decimals).toNumber(), 2);
        const totalCumulated = round(unclaimed[d.holder][d.symbol].toNumber(), 2);

        if (totalCumulated < alreadyClaimedValue) {
          overclaimed.push(`${d.holder}: ${alreadyClaimedValue} / ${totalCumulated} ${d.symbol}`);
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

  return { ...holdersReport, details: expandedDetails, overclaimed };
}
