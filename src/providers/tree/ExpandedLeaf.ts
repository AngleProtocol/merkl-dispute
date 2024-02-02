import { BigNumber } from 'ethers';
import { getAddress } from 'ethers/lib/utils';

import { log } from '../../utils/logger';

export class ExpandedLeaf {
  public campaignId: string;
  public recipient: string;
  public reason: string;
  public rewardToken: string;
  public lastProcessedTimestamp: number;
  public amount: string;
  public auxiliaryData1: number;
  public auxiliaryData2: number;

  constructor(x: {
    campaignId: string;
    recipient: string;
    reason: string;
    rewardToken: string;
    lastProcessedTimestamp: number;
    amount: string;
    auxiliaryData1?: number;
    auxiliaryData2?: number;
  }) {
    if (!x.campaignId || !x.recipient || !x.reason) {
      log.error('ExpandedLeaf', `Invalid ExpandedLeaf: ${x}`);
      throw `Invalid ExpandedLeaf: ${x.campaignId}-${x.recipient}-${x.reason}`;
    }
    try {
      this.campaignId = x.campaignId;
      this.recipient = getAddress(x.recipient);
      this.reason = x.reason;
      this.rewardToken = !!x.rewardToken && getAddress(x.rewardToken);
      this.lastProcessedTimestamp = x.lastProcessedTimestamp;
      this.amount = x.amount;
      this.auxiliaryData1 = x.auxiliaryData1;
      this.auxiliaryData2 = x.auxiliaryData2;
    } catch (e) {
      console.error(x, e);
    }
  }

  static mockLeaf(x: { campaignId: string; recipient: string; reason: string }) {
    return new ExpandedLeaf({ ...x, rewardToken: '', lastProcessedTimestamp: 0, amount: '0' });
  }

  public gt(b: ExpandedLeaf): boolean {
    if (this.campaignId > b.campaignId) return true;
    if (this.campaignId < b.campaignId) return false;
    if (this.recipient > b.recipient) return true;
    if (this.recipient < b.recipient) return false;
    if (this.reason > b.reason) return true;
    if (this.reason < b.reason) return false;
    return false;
  }

  public gte(b: ExpandedLeaf): boolean {
    if (this.campaignId > b.campaignId) return true;
    if (this.campaignId < b.campaignId) return false;
    if (this.recipient > b.recipient) return true;
    if (this.recipient < b.recipient) return false;
    if (this.reason > b.reason) return true;
    if (this.reason < b.reason) return false;
    return true;
  }

  public lt(b: ExpandedLeaf): boolean {
    return !this.gte(b);
  }

  public lte(b: ExpandedLeaf): boolean {
    return !this.gt(b);
  }

  public id(): string {
    return `${this.campaignId}-${this.recipient}-${this.reason}`;
  }

  static id(campaignId: string, recipient: string, reason: string) {
    return this.mockLeaf({ campaignId, recipient, reason }).id();
  }

  public sub(b: ExpandedLeaf): ExpandedLeaf {
    return new ExpandedLeaf({ ...this, amount: BigNumber.from(this.amount).sub(b.amount).toString() });
  }
}
