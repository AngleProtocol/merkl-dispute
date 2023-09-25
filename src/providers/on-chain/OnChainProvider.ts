import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { BigNumber, ContractTransaction, Overrides, Signer, Wallet, providers } from 'ethers';

import { ExponentialBackoffProvider, ExponentialFetchParams } from '../ExponentialBackoffProvider';
import { AMMType } from '@angleprotocol/sdk';
import { HolderClaims, HolderDetail } from '../../bot/holder-checks';

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

  constructor(fetchParams: ExponentialFetchParams = { retries: 5, delay: 500, multiplier: 2 }) {
    super(fetchParams);
  }

  protected abstract onChainParams: (blockNumber: number | undefined) => Promise<OnChainParams>;
  protected abstract timestampAt: (blockNumber: number) => Promise<number>;
  protected abstract activeDistributions: (blockNumber?: number) => Promise<ExtensiveDistributionParametersStructOutput[]>;
  protected abstract poolName: (pool: string, amm: AMMType, blockNumber?: number) => Promise<string>;
  protected abstract claimed: (holderDetails: HolderDetail[]) => Promise<HolderClaims>;
  protected abstract approve: (
    keeper: Wallet,
    disputeToken: string,
    disputeAmount: BigNumber,
    overrides: Overrides
  ) => Promise<ContractTransaction>;

  protected abstract dispute: (keeper: Wallet, reason: string, overrides: Overrides) => Promise<ContractTransaction>;

  async sendApproveTxn(keeper: Wallet, disputeToken: string, disputeAmount: BigNumber, overrides: Overrides) {
    return this.retryWithExponentialBackoff(this.approve, this.fetchParams, keeper, disputeToken, disputeAmount, overrides);
  }

  async sendDisputeTxn(keeper: Wallet, reason: string, overrides: Overrides) {
    return this.retryWithExponentialBackoff(this.dispute, this.fetchParams, keeper, reason, overrides);
  }

  async fetchClaimed(holderDetails: HolderDetail[]): Promise<HolderClaims> {
    return this.retryWithExponentialBackoff(this.claimed, this.fetchParams, holderDetails);
  }

  async fetchPoolName(pool: string, amm: AMMType, blockNumber?: number): Promise<string> {
    return this.retryWithExponentialBackoff(this.poolName, this.fetchParams, pool, amm, blockNumber);
  }

  async fetchActiveDistributions(blockNumber: number): Promise<ExtensiveDistributionParametersStructOutput[]> {
    return this.retryWithExponentialBackoff(this.activeDistributions, this.fetchParams, blockNumber);
  }

  async fetchOnChainParams(blockNumber: number | undefined = undefined): Promise<OnChainParams> {
    return this.retryWithExponentialBackoff(this.onChainParams, this.fetchParams, blockNumber);
  }

  async fetchTimestampAt(blockNumber: number): Promise<number> {
    return this.retryWithExponentialBackoff(this.timestampAt, this.fetchParams, blockNumber);
  }
}
