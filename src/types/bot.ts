import { AggregatedRewardsType, ChainId } from '@angleprotocol/sdk';
import { ContractReceipt, Wallet } from 'ethers';

import { DisputeContext } from '../bot/context';
import { OnChainParams } from '../providers/on-chain/OnChainProvider';
import { HoldersReport } from './holders';

export type StepError = {
  code: BotError;
  reason: string;
  report: MerklReport;
};

export type StepExit = {
  reason: string;
  report: MerklReport;
};

export type DisputeReport = {
  signer?: Wallet;
  approveReceipt?: ContractReceipt;
  disputeReceipt?: ContractReceipt;
};

export type MerklReport = {
  startTime?: number;
  blockNumber?: number;
  startEpoch?: number;
  startRoot?: string;
  startTree?: AggregatedRewardsType;
  endEpoch?: number;
  endRoot?: string;
  endTree?: AggregatedRewardsType;
  params?: OnChainParams;
  chainId?: ChainId;
  holdersReport?: HoldersReport;
  disputeReport?: DisputeReport;
  diffTableUrl?: string;
};

export enum BotError {
  None = -1,
  OnChainFetch,
  BlocktimeFetch,
  EpochFetch,
  TreeFetch,
  TreeRoot,
  NegativeDiff,
  AlreadyClaimed,
  KeeperCreate,
  KeeperApprove,
  KeeperDispute,
}

export type Exit<T> = { err: false; res: T };
export type Error<E> = { err: true; res: E };
export type Result<T, E> = Exit<T> | Error<E>;

export const Result = Object.freeze({
  Exit: <T, E>(exit: T): Result<T, E> => ({ err: false, res: exit }),
  Error: <T, E>(err: E): Result<T, E> => ({ err: true, res: err }),
});

export type StepResult = Result<StepExit, StepError>;

export type Resolver = (res: StepResult | PromiseLike<StepResult>) => void;
export type Step = ({ onChainProvider, blockNumber }: DisputeContext, report: MerklReport, resolve: Resolver) => Promise<MerklReport>;
