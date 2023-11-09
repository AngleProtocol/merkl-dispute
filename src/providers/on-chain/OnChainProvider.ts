import { AMMType } from '@angleprotocol/sdk';
import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { BigNumber, ContractReceipt, Overrides, Wallet } from 'ethers';

import { HolderClaims, HolderDetail } from '../../types/holders';
import { ExponentialBackoffProvider, ExponentialFetchParams } from '../ExponentialBackoffProvider';

export type OnChainParams = {
  disputeToken: string;
  disputeAmount: BigNumber;
  disputePeriod: number;
  endOfDisputePeriod: number;
  disputer: string;
  endRoot: string;
  startRoot: string;
  currentRoot: string;
};

export default abstract class OnChainProvider extends ExponentialBackoffProvider {
  fetchParams: ExponentialFetchParams;
  distributor: string;
  blockNumber: number | undefined;

  constructor(fetchParams: ExponentialFetchParams = { retries: 5, delay: 500, multiplier: 2 }) {
    super(fetchParams);
  }

  protected abstract onChainParams: () => Promise<OnChainParams>;
  protected abstract timestampAt: (blockNumber: number) => Promise<number>;
  protected abstract activeDistributions: () => Promise<ExtensiveDistributionParametersStructOutput[]>;
  protected abstract activeDistributionsBetween: (start: number, end: number) => Promise<ExtensiveDistributionParametersStructOutput[]>;
  protected abstract poolName: (pool: string, amm: AMMType) => Promise<string>;
  protected abstract claimed: (holderDetails: HolderDetail[]) => Promise<HolderClaims>;
  protected abstract approve: (
    keeper: Wallet,
    disputeToken: string,
    disputeAmount: BigNumber,
    overrides: Overrides
  ) => Promise<ContractReceipt>;

  protected abstract dispute: (keeper: Wallet, reason: string, overrides: Overrides) => Promise<ContractReceipt>;
  protected abstract mountBlock: () => Promise<number>;
  protected abstract approval: (address: string, token: string) => Promise<BigNumber>;

  setBlock(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  async mountLastBlock() {
    return this.retryWithExponentialBackoff(this.mountBlock, this.fetchParams);
  }

  async sendApproveTxn(keeper: Wallet, disputeToken: string, disputeAmount: BigNumber, overrides: Overrides) {
    return this.retryWithExponentialBackoff(this.approve, this.fetchParams, keeper, disputeToken, disputeAmount, overrides);
  }

  async sendDisputeTxn(keeper: Wallet, reason: string, overrides: Overrides) {
    return this.retryWithExponentialBackoff(this.dispute, this.fetchParams, keeper, reason, overrides);
  }

  async fetchClaimed(holderDetails: HolderDetail[]): Promise<HolderClaims> {
    return this.retryWithExponentialBackoff(this.claimed, this.fetchParams, holderDetails);
  }

  async fetchPoolName(pool: string, amm: AMMType): Promise<string> {
    return this.retryWithExponentialBackoff(this.poolName, this.fetchParams, pool, amm);
  }

  async fetchApproval(address: string, token: string): Promise<BigNumber> {
    return this.retryWithExponentialBackoff(this.approval, this.fetchParams, address, token);
  }

  async fetchActiveDistributions(): Promise<ExtensiveDistributionParametersStructOutput[]> {
    return this.retryWithExponentialBackoff(this.activeDistributions, this.fetchParams);
  }

  async fetchActiveDistributionsBetween(start: number, end: number): Promise<ExtensiveDistributionParametersStructOutput[]> {
    return this.retryWithExponentialBackoff(this.activeDistributionsBetween, this.fetchParams, start, end);
  }

  async fetchOnChainParams(): Promise<OnChainParams> {
    return this.retryWithExponentialBackoff(this.onChainParams, this.fetchParams);
  }

  async fetchTimestampAt(blockNumber: number): Promise<number> {
    return this.retryWithExponentialBackoff(this.timestampAt, this.fetchParams, blockNumber);
  }
}
