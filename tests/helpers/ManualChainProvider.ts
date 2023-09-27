import { ExtensiveDistributionParametersStructOutput } from '@angleprotocol/sdk/dist/constants/types/DistributionCreator';
import { ContractReceipt } from 'ethers';

import OnChainProvider, { OnChainParams } from '../../src/providers/on-chain/OnChainProvider';
import { HolderClaims } from '../../src/types/holders';

export default class ManualChainProvider extends OnChainProvider {
  claimedCall: () => HolderClaims;
  activeDistributionCall: () => ExtensiveDistributionParametersStructOutput[];
  poolNameCall: () => string;

  constructor(
    activeDistributionCall: () => ExtensiveDistributionParametersStructOutput[],
    claimedCall: () => HolderClaims,
    poolNameCall: () => string
  ) {
    super({ retries: 1, delay: 1, multiplier: 1 });
    this.activeDistributionCall = activeDistributionCall;
    this.claimedCall = claimedCall;
    this.poolNameCall = poolNameCall;
  }

  override activeDistributions = async () => {
    return this?.activeDistributionCall();
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

  override mountBlock = async () => new Promise<number>((_, reject) => reject());
}
