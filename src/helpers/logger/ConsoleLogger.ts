import { BigNumber } from 'ethers';
import { DisputeContext } from '../../bot/run';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import Logger from './Logger';

const chains = {
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  1101: 'Polygon zvEVM',
};

export default class ConsoleLogger extends Logger {
  context = (context: DisputeContext, timestamp?: number) => {
    const date = new Date(timestamp * 1000);
    console.groupCollapsed(`[Merkle Dispute Bot] running on:`);
    console.log('chainId:', chains[context.chainId] ?? '', `(${context.chainId})`);
    console.log(
      'block:',
      !!context.blockNumber ? context.blockNumber : 'latest',
      `(${date.toLocaleDateString()} at ${date.toLocaleTimeString()})`
    );
    console.groupEnd();
  };
  onChainParams = (params: OnChainParams) => {
    console.groupCollapsed(`On-Chain context:`);

    Object.keys(params).forEach((key) => {
      const value = params[key];

      console.log(`${key}:`, value?._isBigNumber ? BigNumber.from(value).toString() : value);
    });

    console.groupEnd();
  };
}
