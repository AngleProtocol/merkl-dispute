import {
  AggregatedRewardsType,
  ChainId,
  DistributionCreator__factory,
  Distributor__factory,
  formatNumber,
  Int256,
  registry,
} from '@angleprotocol/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber } from 'ethers';
import moment from 'moment';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                  PARAMETERS                                                    
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId = ChainId.MAINNET;

/**
 *  If MODE == LOCAL you need to fill `./jsons/start.json` and `./jsons/end.json`
 *
 *  If MODE == DISTANT you need to fill `startTimestamp` and `endTimestamp` and jsons will be fetch from github
 *  main branch
 */
const MODE: 'LOCAL' | 'DISTANT' = 'LOCAL';

const startTimestamp = 469354 * 3600; // moment('2023-07-18', 'YYYY-MM-DD').unix();
const endTimestamp = 469366 * 3600; // moment().unix();

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                               END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import endJson from './jsons/end.json';
import startJson from './jsons/start.json';

dotenv.config();

import { fetchPoolName, round } from '../helpers';
import { httpProvider } from '../providers';
import { MerklIndexType } from '../routes/dispute-bot';

const githubURL = `https://raw.githubusercontent.com/AngleProtocol/merkl-rewards/main/`;
const provider = httpProvider(chainId);

(async () => {
  if (startTimestamp > endTimestamp) {
    throw 'Start timestamp is after end timestamp';
  }
  const call = await axios.get<MerklIndexType>(githubURL + `${chainId + `/index.json`}`, {
    timeout: 5000,
  });
  const merklIndex = call.data;

  let startTree: AggregatedRewardsType;
  let endTree: AggregatedRewardsType;
  if (MODE !== 'LOCAL') {
    /**
     * Rounds down timestamp to the last reward computation
     */
    let startEpoch = Math.floor(startTimestamp / 3600);
    while (!Object.values(merklIndex).includes(startEpoch)) {
      startEpoch -= 1;
    }
    let endEpoch = Math.floor(endTimestamp / 3600);
    while (!Object.values(merklIndex).includes(endEpoch)) {
      endEpoch -= 1;
    }
    startTree = (
      await axios.get<AggregatedRewardsType>(githubURL + `${chainId + `/backup/rewards_${startEpoch}.json`}`, {
        timeout: 5000,
      })
    ).data;
    endTree = (
      await axios.get<AggregatedRewardsType>(githubURL + `${chainId + `/backup/rewards_${endEpoch}.json`}`, {
        timeout: 5000,
      })
    ).data;

    console.log(`Comparing ${startEpoch} and ${endEpoch} jsons`);
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

  const activeDistributions = await DistributionCreator__factory.connect(
    registry(chainId).Merkl.DistributionCreator,
    provider
  ).getActiveDistributions();

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
        const symbol = endTree?.rewards?.[k].tokenSymbol;
        const pool = endTree?.rewards?.[k]?.pool;

        if (!poolName[pool]) {
          poolName[pool] = await fetchPoolName(chainId, pool, endTree?.rewards?.[k]?.amm);
        }

        const solidityDist = activeDistributions.find((d) => d.base.rewardId === k);
        const ratePerEpoch = Int256.from(solidityDist?.base.amount ?? 0, decimals).toNumber() / solidityDist?.base.numEpoch;
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

  // Sort details by distribution and format numbers
  details = await Promise.all(
    details
      .sort((a, b) =>
        a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : a.percent > b.percent ? -1 : b.percent > a.percent ? 1 : 0
      )
      .map(async (d) => {
        const alreadyClaimed = round(
          Int256.from(
            (await Distributor__factory.connect(registry(chainId).Merkl.Distributor, provider).claimed(d.holder, d.tokenAddress)).amount,
            d.decimals
          ).toNumber(),
          2
        );
        const totalCumulated = round(unclaimed[d.holder][d.symbol].toNumber(), 2);
        return {
          ...d,
          diff: round(d.diff, 2),
          percent: round(d.percent, 2),
          distribution: d.distribution.slice(0, 5),
          totalCumulated,
          alreadyClaimed,
          issueSpotted: totalCumulated < alreadyClaimed,
        };
      })
  );
  console.table(details, [
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

  console.table(
    Object.keys(changePerDistrib)
      .map((k) => {
        return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
      })
      .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
  );
})();
