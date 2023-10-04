import {
  AMMAlgorithmMapping,
  AMMAlgorithmType,
  AMMType,
  DistributionCreator__factory,
  Distributor__factory,
  Erc20__factory,
  Multicall__factory,
  PoolInterface,
} from '@angleprotocol/sdk';
import { Multicall3 } from '@angleprotocol/sdk/dist/constants/types/Multicall';
import { BigNumber, Overrides, providers, Wallet } from 'ethers';

import { batchMulticallCall, multicallContractCall } from '../../utils';
import { ExponentialFetchParams } from '../ExponentialBackoffProvider';
import OnChainProvider from './OnChainProvider';
import { HolderDetail } from '../../types/holders';

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
  distributorCreator: string;

  constructor(url: string, distributor: string, distributorCreator: string, fetchParams?: ExponentialFetchParams) {
    super(fetchParams);

    this.provider = new providers.JsonRpcProvider(url);
    this.distributor = distributor;
    this.distributorCreator = distributorCreator;
  }

  override approval = async (address: string, token: string) => {
    return await Erc20__factory.connect(token, this.provider).allowance(address, this.distributor);
  };

  override approve = async (keeper: Wallet, disputeToken: string, disputeAmount: BigNumber, overrides: Overrides) => {
    const txn = await Erc20__factory.connect(disputeToken, keeper.connect(this.provider)).approve(
      this.distributor,
      disputeAmount,
      overrides
    );

    return await txn.wait();
  };

  override dispute = async (keeper: Wallet, reason: string, overrides: Overrides) => {
    const distributorContract = Distributor__factory.connect(this.distributor, keeper.connect(this.provider));
    const txn = await distributorContract.disputeTree(reason, overrides);

    return await txn.wait();
  };

  override mountBlock = async (): Promise<number> => {
    const block = await this.provider.getBlockNumber();

    this.blockNumber = block;
    return block;
  };

  override timestampAt = async (blockNumber: number) => {
    return (await this.provider.getBlock(blockNumber)).timestamp;
  };

  override activeDistributions = async () => {
    const instance = DistributionCreator__factory.connect(this.distributorCreator, this.provider);

    return instance.getActiveDistributions({ blockTag: this.blockNumber });
  };

  override poolName = async (pool: string, amm: AMMType) => {
    const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', this.provider);
    const poolInterface = PoolInterface(AMMAlgorithmMapping[amm]);
    const erc20Interface = Erc20__factory.createInterface();

    let calls = [
      {
        callData: poolInterface.encodeFunctionData('token0'),
        target: pool,
        allowFailure: false,
      },
      {
        callData: poolInterface.encodeFunctionData('token1'),
        target: pool,
        allowFailure: false,
      },
      ...(AMMAlgorithmMapping[amm] === AMMAlgorithmType.UniswapV3
        ? [
            {
              callData: poolInterface.encodeFunctionData('fee'),
              target: pool,
              allowFailure: false,
            },
          ]
        : []),
    ];
    let res = await multicall.callStatic.aggregate3(calls, { blockTag: this.blockNumber });
    let i = 0;
    const token0 = poolInterface.decodeFunctionResult('token0', res[i++].returnData)[0];
    const token1 = poolInterface.decodeFunctionResult('token1', res[i++].returnData)[0];
    let fee;
    if (AMMAlgorithmMapping[amm] === AMMAlgorithmType.UniswapV3) {
      fee = poolInterface.decodeFunctionResult('fee', res[i].returnData)[0];
    }
    calls = [
      {
        callData: erc20Interface.encodeFunctionData('symbol'),
        target: token0,
        allowFailure: false,
      },
      {
        callData: erc20Interface.encodeFunctionData('symbol'),
        target: token1,
        allowFailure: false,
      },
    ];
    res = await multicall.callStatic.aggregate3(calls, { blockTag: this.blockNumber });
    const token0Symbol = erc20Interface.decodeFunctionResult('symbol', res[0].returnData)[0];
    const token1Symbol = erc20Interface.decodeFunctionResult('symbol', res[1].returnData)[0];

    return `${AMMType[amm]} ${token0Symbol}-${token1Symbol}-${fee ?? ``}`;
  };

  override onChainParams = async () => {
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

    const result = await batchMulticallCall(multicallContractCall, multicall, { data: calls, blockNumber: this.blockNumber });
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

  override claimed = async (holderDetails: HolderDetail[]) => {
    const distributor = Distributor__factory.createInterface();
    const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', this.provider);

    const alreadyClaimed: { [address: string]: { [symbol: string]: string } } = {};
    const calls: Multicall3.Call3Struct[] = [];

    for (const d of holderDetails) {
      if (!alreadyClaimed[d.holder]) alreadyClaimed[d.holder] = {};
      if (!alreadyClaimed[d.holder][d.tokenAddress]) {
        alreadyClaimed[d.holder][d.tokenAddress] = 'PENDING';
        calls.push({
          callData: distributor.encodeFunctionData('claimed', [d.holder, d.tokenAddress]),
          target: this.distributor,
          allowFailure: false,
        });
      }
    }
    const res = await batchMulticallCall(multicallContractCall, multicall, { data: calls, blockNumber: this.blockNumber });
    let decodingIndex = 0;
    for (const d of holderDetails) {
      if (alreadyClaimed[d.holder][d.tokenAddress] === 'PENDING') {
        alreadyClaimed[d.holder][d.tokenAddress] = distributor.decodeFunctionResult('claimed', res[decodingIndex++])[0];
      }
    }

    return alreadyClaimed;
  };
}
