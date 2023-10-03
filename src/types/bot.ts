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

export type StepSuccess = {
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

export type Exit<T> = { err: false; exit: true; res: T };
export type Success<S> = { err: false; exit: false; res: S };
export type Error<E> = { err: true; exit: true; res: E };
export type Result<T, E, S> = Exit<T> | Error<E> | Success<S>;

export const Result = Object.freeze({
  Success: (report: MerklReport): StepResult => ({ err: false, exit: false, res: { reason: '', report } }),
  Exit: (exit: StepExit): StepResult => ({ err: false, exit: true, res: exit }),
  Error: (err: StepError): StepResult => ({ err: true, exit: true, res: err }),
});

export type StepResult = Result<StepExit, StepError, StepSuccess>;

export type Resolver = (res: StepResult | PromiseLike<StepResult>) => void;
export type Step = ({ onChainProvider, blockNumber }: DisputeContext, report: MerklReport) => Promise<StepResult>;
