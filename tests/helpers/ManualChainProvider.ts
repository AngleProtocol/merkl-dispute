import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/generated/DistributionCreator';
import { BigNumber, ContractReceipt } from 'ethers';

import OnChainProvider, { OnChainParams } from '../../src/providers/on-chain/OnChainProvider';
import { HolderClaims } from '../../src/types/holders';

export default class ManualChainProvider extends OnChainProvider {
  claimedCall: () => HolderClaims;
  activeDistributionCall: () => ExtensiveDistributionParametersStructOutput[];
  activeDistributionsBetweenCall: (start: number, end: number) => ExtensiveDistributionParametersStructOutput[];
  poolNameCall: () => string;

  constructor(
    activeDistributionCall: () => ExtensiveDistributionParametersStructOutput[],
    activeDistributionsBetweenCall: (start: number, end: number) => ExtensiveDistributionParametersStructOutput[],
    claimedCall: () => HolderClaims,
    poolNameCall: () => string
  ) {
    super({ retries: 1, delay: 1, multiplier: 1 });
    this.activeDistributionCall = activeDistributionCall;
    this.activeDistributionsBetweenCall = activeDistributionsBetweenCall;
    this.claimedCall = claimedCall;
    this.poolNameCall = poolNameCall;
  }

  override activeDistributions = async () => {
    return this?.activeDistributionCall();
  };

  override activeDistributionsBetween = async (start: number, end: number) => {
    return this?.activeDistributionsBetweenCall(start, end);
  };

  override claimed = async () => {
    return this?.claimedCall();
  };

  override poolName = async () => {
    return this.poolNameCall();
  };

  override onChainParams = async () => new Promise<OnChainParams>((_, reject) => reject());
  override timestampAt = async () => new Promise<number>((_, reject) => reject());
  override approve = async () => new Promise<ContractReceipt>((_, reject) => reject());
  override dispute = async () => new Promise<ContractReceipt>((_, reject) => reject());
  override approval = async () => new Promise<BigNumber>((_, reject) => reject());

  override mountBlock = async () => new Promise<number>((_, reject) => reject());
}
