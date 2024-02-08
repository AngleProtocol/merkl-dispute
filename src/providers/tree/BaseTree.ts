import { BASE_9, Campaign, CampaignParameters, Erc20__factory, Int256, MerklChainId } from '@angleprotocol/sdk';
import { BigNumber, utils } from 'ethers';
import keccak256 from 'keccak256';
import MerkleTree from 'merkletreejs';

import { MERKL_TREE_OPTIONS } from '../../constants';
import { DiffCampaigns, DiffRecipients } from '../../types';
import { addStrings, gtStrings, subStrings } from '../../utils/addString';
import { displayString } from '../../utils/displayString';
import { getSolidityIndex } from '../../utils/indexing';
import { log } from '../../utils/logger';
import { overridenConsole, overridenConsoleRead } from '../../utils/overridenConsole';
import { provider } from '../../utils/providers';
import { ExpandedLeaf } from './ExpandedLeaf';

export class BaseTree {
  public chainId: MerklChainId;
  public data: ExpandedLeaf[];
  public tree: MerkleTree;
  public idToAmount: { [id: string]: { amount: BigNumber; leafIndex: number } };

  constructor(data: any, chainId: MerklChainId) {
    this.data = data.map((x) => new ExpandedLeaf(x));
    this.chainId = chainId;
  }

  /**
   * @notice Sort the tree by campaignId, recipient, reason
   * @dev Assumes the data contains only a single tree (1 chainId, 1 root)
   */
  public sort() {
    this.data.sort((a, b) => {
      if (a.gte(b)) return 1;
      else return -1;
    });
  }

  /**
   * @notice Compute lastProcessedTimestamp by taking the max over all campaignIds
   */
  public lastProcessedTimestamp() {
    return this.data.reduce((acc, point) => Math.max(acc, point.lastProcessedTimestamp), 0);
  }

  public totalAmount(): string {
    return this.data.reduce((acc, point) => addStrings(acc, point.amount), '0');
  }

  public campaignIds() {
    return this.data.reduce((acc, leaf) => {
      if (!acc.includes(leaf.campaignId)) {
        acc.push(leaf.campaignId);
      }
      return acc;
    }, []);
  }

  public merklRoot() {
    return this.tree.getHexRoot();
  }

  public getProof(user: string, token: string): string[] {
    return this.tree.getHexProof(
      utils.keccak256(
        utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [utils.getAddress(user), utils.getAddress(token), this.idToAmount[`${utils.getAddress(user)}-${utils.getAddress(token)}`].amount]
        )
      ),
      this.idToAmount[`${utils.getAddress(user)}-${utils.getAddress(token)}`].leafIndex
    );
  }

  /**
   * @notice Computes the merkl tree associated with the expanded data
   */
  public buildMerklTree() {
    /** IDs of the merkl leaves are (user, token)  */
    const idToAMount = {};
    for (const point of this.data) {
      const id = `${point.recipient}-${point.rewardToken}`;
      if (!idToAMount.hasOwnProperty(id)) {
        idToAMount[id] = { amount: BigNumber.from(0), leafIndex: 0 };
      }
      idToAMount[id].amount = idToAMount[id].amount.add(point.amount);
    }

    const leaves: { hashedLeaf: string; rawLeaf: string }[] = Object.keys(idToAMount)
      .filter((id) => idToAMount[id].amount.gt(0))
      .map((id) => {
        const [recipient, token] = id.split('-');
        const rawLeaf = utils.defaultAbiCoder.encode(['address', 'address', 'uint256'], [recipient, token, idToAMount[id].amount]);
        return { rawLeaf, hashedLeaf: utils.keccak256(rawLeaf) };
      });

    log.local(`🌴 tree with ${leaves.length} leaves computed`);

    // Sort leaves
    leaves.sort((a, b) => {
      if (a.hashedLeaf > b.hashedLeaf) return 1;
      else return -1;
    });

    // Store leaf index in idToAmount
    leaves.forEach((leaf, index) => {
      const [recipient, token] = utils.defaultAbiCoder.decode(['address', 'address', 'uint256'], leaf.rawLeaf);
      idToAMount[`${recipient}-${token}`].leafIndex = index;
    });
    this.tree = new MerkleTree(
      leaves.map((l) => l.hashedLeaf),
      keccak256,
      MERKL_TREE_OPTIONS
    );

    this.idToAmount = idToAMount;
  }

  public checkIsSorted() {
    // Check still sorted
    let index = 1;
    while (index < this.data.length - 1) {
      if (!this.data[index - 1].lt(this.data[index])) {
        log.error('checkIsSorted', `tree isn't sorted anymore`);
      }
      index++;
    }
  }

  /**
   * @notice Find index of a given point
   * @dev - Assumes the data contains only a single tree
   * @dev - Assumes the data is sorted by campaignId, recipient, reason
   */
  public findIndex(campaignId: string, recipient: string, reason: string): { found: boolean; index: number } {
    let left = 0;
    let right = this.data.length - 1;
    let firstIndex = -1;
    let lastIndex = -1;

    const target = ExpandedLeaf.mockLeaf({ campaignId, recipient, reason });

    // Find the first occurrence
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      // Check if the middle element starts with the target string
      if (this.data[mid].campaignId === campaignId && this.data[mid].recipient === recipient && this.data[mid].reason === reason) {
        firstIndex = mid;
        // Move to the left half to find the first occurrence
        right = mid - 1;
      } else if (this.data[mid].lt(target)) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Reset pointers for second search
    left = 0;
    right = this.data.length - 1;

    // Find the last occurrence
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      // Check if the middle element starts with the target string
      if (this.data[mid].campaignId === campaignId && this.data[mid].recipient === recipient && this.data[mid].reason === reason) {
        lastIndex = mid;
        // Move to the right half to find the last occurrence
        left = mid + 1;
      } else if (this.data[mid].lt(target)) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (firstIndex !== lastIndex) {
      log.error('findIndex', `found multiple occurrences of ${campaignId} ${recipient} ${reason} in the tree`);
    }

    if (firstIndex === -1) {
      if (left > this.data.length || (left < this.data.length && this.data[left].gt(target))) left -= 1; // Undo last iteration if needed
      // At this point left is the rightmost index that is smaller than the target

      const insertionIndex = Math.min(left + 1, this.data.length);
      if (this.data.length === 0) return { found: false, index: 0 };
      if (insertionIndex === 1 && this.data[0].gt(target)) return { found: false, index: 0 };
      return { found: false, index: insertionIndex };
    }
    return { found: true, index: firstIndex };
  }

  /**
   * @dev Sums amount per token in the tree
   *      Compare these sums to the balances of the distributor
   *      Throw if distributed amounts are above the balances
   */
  public async compareToContractBalances(distributor: string) {
    const amountsPerToken: { [token: string]: string } = {};

    for (const leaf of this.data) {
      const rewardToken = leaf.rewardToken;
      if (!amountsPerToken[rewardToken]) amountsPerToken[rewardToken] = '0';
      const sum = addStrings(amountsPerToken[rewardToken], leaf.amount);
      amountsPerToken[rewardToken] = sum;
    }

    for (const token of Object.keys(amountsPerToken)) {
      const res = await Erc20__factory.connect(token, provider(this.chainId)).balanceOf(distributor);
      if (res.lt(BigNumber.from(amountsPerToken[token]))) {
        log.warn(`${amountsPerToken[token]} in new tree but ${res.toString()} in contract`);
        throw new Error(`not enough reserves in Distributor contract for token ${token}`);
      }
    }
  }

  /**
   * @notice Fetches info about a given distribution
   * @dev - Assumes the data is sorted by campaignId
   */
  public campaignInfo(campaignId: string) {
    let left = 0;
    let right = this.data.length - 1;
    let firstIndex = -1;
    let lastIndex = -1;
    // Find the first occurrence
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      // Check if the middle element starts with the target string
      if (this.data[mid].campaignId === campaignId) {
        firstIndex = mid;
        // Move to the left half to find the first occurrence
        right = mid - 1;
      } else if (this.data[mid].campaignId < campaignId) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    // Reset pointers for second search
    left = 0;
    right = this.data.length - 1;
    // Find the last occurrence
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      // Check if the middle element starts with the target string
      if (this.data[mid].campaignId === campaignId) {
        lastIndex = mid;
        // Move to the right half to find the last occurrence
        left = mid + 1;
      } else if (this.data[mid].campaignId <= campaignId) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    /** Campaign doesn't exist */
    if (firstIndex === -1 || lastIndex === -1) {
      return { firstIndex: -1, lastIndex: -1, lastUpdateEpoch: 0, totalAmount: '0' };
    }

    let lastUpdateEpoch = 0;
    let totalAmount = '0';
    for (const point of this.data.slice(firstIndex, lastIndex + 1)) {
      if (point.lastProcessedTimestamp > lastUpdateEpoch) {
        lastUpdateEpoch = point.lastProcessedTimestamp;
      }
      if (point.campaignId !== campaignId) {
        log.error('campaignInfo', `Invalid ${campaignId} sorting`);
      }
      totalAmount = addStrings(totalAmount, point.amount);
    }
    return { firstIndex, lastIndex, lastUpdateEpoch, totalAmount };
  }

  public static computeDiff(
    oldTree: BaseTree,
    newTree: BaseTree,
    campaigns: { [campaignId: string]: CampaignParameters<Campaign> }
  ): {
    diffCampaigns: DiffCampaigns;
    diffRecipients: DiffRecipients;
    negativeDiffs: ExpandedLeaf[];
  } {
    // Add campaigns data so we can log epochs, format numbers, etc
    const diffLeaves: ExpandedLeaf[] = [];

    const oldCampaignIds = oldTree.campaignIds();
    const newCampaignIds = newTree.campaignIds();

    /** Check all oldCampaignTypes are still present */
    for (const oldCampaignId of oldCampaignIds) {
      if (!newCampaignIds.includes(oldCampaignId)) {
        log.error('computeDiff', `old tree campaign ${oldCampaignId} not found in new tree`);
      }
    }

    const statsPerCampaign: {
      [campaignId: string]: {
        total: string;
        diff: string;
        'recipients/reasons': number;
        lastProcessedTimestamp: number;
        oldLastProcessedTimestamp: number;
      };
    } = {};

    const negativeDiffs: ExpandedLeaf[] = [];

    newTree.sort();
    for (const campaignId of newCampaignIds) {
      const campaignInfo = newTree.campaignInfo(campaignId);

      // TODO @BaptistG
      // @dev Compute the total amount per campaign to display it
      // Compare to campaign data to check there is no over distribution
      statsPerCampaign[campaignId] = {
        diff: '0',
        total: campaignInfo.totalAmount,
        'recipients/reasons': 0,
        lastProcessedTimestamp: 0,
        oldLastProcessedTimestamp: 0,
      };

      let index = campaignInfo.firstIndex;
      while (index <= campaignInfo.lastIndex) {
        const newLeaf = newTree.data[index];
        oldTree.sort();
        const oldIndex = oldTree.findIndex(newLeaf.campaignId, newLeaf.recipient, newLeaf.reason);

        const diffLeaf = !oldIndex.found ? newLeaf : newLeaf.sub(oldTree.data[oldIndex.index]);
        statsPerCampaign[campaignId].diff = addStrings(statsPerCampaign[campaignId].diff, diffLeaf.amount);
        statsPerCampaign[campaignId]['recipients/reasons'] += 1;
        statsPerCampaign[campaignId].lastProcessedTimestamp = newLeaf.lastProcessedTimestamp;

        if (gtStrings('0', diffLeaf.amount)) {
          negativeDiffs.push(diffLeaf);
        }

        diffLeaves.push(diffLeaf);
        index++;
      }
    }

    const diffTree = new BaseTree(diffLeaves, newTree.chainId);
    diffTree.sort();

    const diffCampaigns = Object.keys(statsPerCampaign)
      ?.filter((c) => statsPerCampaign[c].diff !== '0')
      .map((campaignId) => {
        const decimalsRewardToken = campaigns[campaignId].campaignParameters.decimalsRewardToken;
        return {
          campaignId: campaignId,
          solidityIndex: getSolidityIndex(campaigns[campaignId].index),
          token: campaigns[campaignId].campaignParameters.symbolRewardToken,
          diff: displayString(statsPerCampaign[campaignId].diff, decimalsRewardToken),
          total: Int256.from(statsPerCampaign[campaignId].total, decimalsRewardToken).raw.toString(),
          remainer: displayString(subStrings(campaigns[campaignId].amount, statsPerCampaign[campaignId].total), decimalsRewardToken),
          ['% done']: (
            BigNumber.from(statsPerCampaign[campaignId].total).mul(BASE_9).div(campaigns[campaignId].amount).toNumber() / 1e7
          ).toFixed(6),
          ['% time done']: (
            ((statsPerCampaign[campaignId].lastProcessedTimestamp - campaigns[campaignId].startTimestamp) /
              (campaigns[campaignId].endTimestamp - campaigns[campaignId].startTimestamp)) *
            100
          ).toFixed(6),
          ['recipients/reasons']: statsPerCampaign[campaignId]['recipients/reasons'],
        };
      });

    const diffRecipients = diffTree.data
      .filter((d) => d.amount !== '0')
      .map((x) => {
        return {
          campaignId: x.campaignId,
          recipient: x.recipient,
          reason: x.reason,
          diff: displayString(x.amount, campaigns[x.campaignId].campaignParameters.decimalsRewardToken),
          total: displayString(
            newTree.data[newTree.findIndex(x.campaignId, x.recipient, x.reason).index].amount,
            campaigns[x.campaignId].campaignParameters.decimalsRewardToken
          ),
          token: campaigns[x.campaignId].campaignParameters.symbolRewardToken,
          percentage: ((parseFloat(x.amount) * 100) / parseFloat(statsPerCampaign[x.campaignId].diff)).toFixed(6),
        };
      });

    return {
      diffCampaigns,
      diffRecipients,
      negativeDiffs,
    };

    // overridenConsole.log('Stats per Campaign:\n');
    // overridenConsole.table(
    //   Object.keys(statsPerCampaign)
    //     ?.filter((c) => statsPerCampaign[c].diff !== '0')
    //     .map((campaignId) => {
    //       const decimalsRewardToken = campaigns[campaignId].campaignParameters.decimalsRewardToken;
    //       return {
    //         campaignId: sliceCampaignId(campaignId),
    //         solidityIndex: getSolidityIndex(campaigns[campaignId].index),
    //         token: campaigns[campaignId].campaignParameters.symbolRewardToken,
    //         diff: displayString(statsPerCampaign[campaignId].diff, decimalsRewardToken),
    //         total: displayString(statsPerCampaign[campaignId].total, decimalsRewardToken),
    //         remainer: displayString(subStrings(campaigns[campaignId].amount, statsPerCampaign[campaignId].total), decimalsRewardToken),
    //         ['% done']: (
    //           BigNumber.from(statsPerCampaign[campaignId].total).mul(BASE_9).div(campaigns[campaignId].amount).toNumber() / 1e7
    //         ).toFixed(6),
    //         ['% time done']: (
    //           ((statsPerCampaign[campaignId].lastProcessedTimestamp - campaigns[campaignId].startTimestamp) /
    //             (campaigns[campaignId].endTimestamp - campaigns[campaignId].startTimestamp)) *
    //           100
    //         ).toFixed(6),
    //         ['recipients/reasons']: statsPerCampaign[campaignId]['recipients/reasons'],
    //       };
    //     })
    // );

    // overridenConsole.log('\n\nStats per Recipient:\n');
    // overridenConsole.table(
    //   diffTree.data
    //     .filter((d) => d.amount !== '0')
    //     .map((x) => {
    //       return {
    //         campaignId: sliceCampaignId(x.campaignId),
    //         recipient: x.recipient,
    //         reason: x.reason,
    //         diff: displayString(x.amount, campaigns[x.campaignId].campaignParameters.decimalsRewardToken),
    //         total: displayString(
    //           newTree.data[newTree.findIndex(x.campaignId, x.recipient, x.reason).index].amount,
    //           campaigns[x.campaignId].campaignParameters.decimalsRewardToken
    //         ),
    //         token: campaigns[x.campaignId].campaignParameters.symbolRewardToken,
    //         percentage: ((parseFloat(x.amount) * 100) / parseFloat(statsPerCampaign[x.campaignId].diff)).toFixed(6),
    //       };
    //     })
    // );
    // return (overridenConsoleRead.read() || '').toString();
  }

  public generateReport(): string {
    const statsPerCampaign: { [campaignId: string]: { total: string } } = {};
    for (const campaignId of this.campaignIds()) {
      const campaignInfo = this.campaignInfo(campaignId);

      statsPerCampaign[campaignId] = { total: campaignInfo.totalAmount };
    }

    overridenConsole.log('Stats per Campaign:\n');
    overridenConsole.table(
      Object.keys(statsPerCampaign).map((campaignId) => {
        return {
          campaignId,
          total: statsPerCampaign[campaignId].total,
        };
      })
    );
    overridenConsole.log('\n\nStats per Recipient:\n');
    overridenConsole.table(
      this.data.map((x) => {
        return {
          campaignId: x.campaignId,
          recipient: x.recipient,
          reason: x.reason,
          amount: x.amount,
        };
      })
    );
    return (overridenConsoleRead.read() || '').toString();
  }
}
