import { AggregatedRewardsType, Int256 } from '@angleprotocol/sdk';
import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { DisputeState } from './run';
import { BigNumber } from 'ethers';
import { fetchPoolName } from '../helpers';
import { DisputeContext } from './context';

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

export default async function checkNegativeDiffs(
  context: DisputeContext,
  startTree: AggregatedRewardsType,
  endTree: AggregatedRewardsType
): Promise<DisputeState> {
  const holders = gatherHolders(startTree, endTree);
  const { onChainProvider } = context;

  const activeDistributions = await onChainProvider.fetchActiveDistributions(context.blockNumber);

  // The goal will be to fill this for every holder
  const details: {
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
        if (diff < 0)
          return {
            error: true,
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

  return { error: false, reason: '' };
}
