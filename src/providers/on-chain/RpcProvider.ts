import { Distributor__factory, Multicall__factory } from '@angleprotocol/sdk';
import { providers } from 'ethers';

import { batchMulticallCall, multicallContractCall } from '../../utils';
import { ExponentialFetchParams } from '../ExponentialBackoffProvider';
import OnChainProvider from './OnChainProvider';

// type fragment =
//   | 'disputeToken'
//   | 'disputeAmount'
//   | 'disputePeriod'
//   | 'endOfDisputePeriod'
//   | 'disputer'
//   | 'tree'
//   | 'lastTree'
//   | 'getMerkleRoot';

// const multicallFunctions: fragment[] = [
//   'disputeToken',
//   'disputeAmount',
//   'disputePeriod',
//   'endOfDisputePeriod',
//   'disputer',
//   'tree',
//   'lastTree',
//   'getMerkleRoot',
// ];

export default class RpcProvider extends OnChainProvider {
  provider: providers.JsonRpcProvider;
  distributor: string;

  constructor(url: string, distributor: string, fetchParams?: ExponentialFetchParams) {
    super(fetchParams);

    this.provider = new providers.JsonRpcProvider(url);
    this.distributor = distributor;
  }

  override timestampAt = async (blockNumber: number) => {
    return (await this.provider.getBlock(blockNumber)).timestamp;
  };

  override onChainParams = async (blockNumber: number | undefined) => {
    const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', this.provider);
    const distributor = Distributor__factory.createInterface();

    const calls = [
      {
        callData: distributor.encodeFunctionData('disputeToken'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('disputeAmount'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('disputePeriod'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('endOfDisputePeriod'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('disputer'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('tree'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('lastTree'),
        target: this.distributor,
        allowFailure: false,
      },
      {
        callData: distributor.encodeFunctionData('getMerkleRoot'),
        target: this.distributor,
        allowFailure: false,
      },
    ];

    const result = await batchMulticallCall(multicallContractCall, multicall, { data: calls, blockNumber });
    let i = 0;
    return {
      disputeToken: distributor.decodeFunctionResult('disputeToken', result[i++])[0],
      disputeAmount: distributor.decodeFunctionResult('disputeAmount', result[i++])[0],
      disputePeriod: distributor.decodeFunctionResult('disputePeriod', result[i++])[0],
      endOfDisputePeriod: distributor.decodeFunctionResult('endOfDisputePeriod', result[i++])[0],
      disputer: distributor.decodeFunctionResult('disputer', result[i++])[0],
      endRoot: distributor.decodeFunctionResult('tree', result[i++])[0],
      startRoot: distributor.decodeFunctionResult('lastTree', result[i++])[0],
      currentRoot: distributor.decodeFunctionResult('getMerkleRoot', result[i])[0],
    };
  };
}
