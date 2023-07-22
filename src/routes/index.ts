import {
  AggregatedRewardsType,
  Distributor__factory,
  Erc20__factory,
  Multicall__factory,
  NETWORK_LABELS,
  registry,
} from '@angleprotocol/sdk';
import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { BigNumber, Wallet } from 'ethers';
import { Router } from 'express';
import moment from 'moment';

dotenv.config();

import { Console } from 'console';
import { Transform } from 'stream';
import { StringDecoder } from 'string_decoder';

import { GITHUB_URL, NULL_ADDRESS } from '../constants';
import { httpProvider } from '../providers';
import { reportDiff } from '../scripts/diff';
import { createGist, getChainId, retryWithExponentialBackoff } from '../utils';
import { sendSummary } from '../utils/discord';
import { computeAccumulatedRewardSinceInception, log } from '../utils/merkl';

export type MerklIndexType = { [merklRoot: string]: number };

const router = Router();

type OnChainParams = {
  disputeToken: string;
  disputeAmount: BigNumber;
  disputePeriod: number;
  endOfDisputePeriod: number;
  disputer: string;
  endRoot: string;
  startRoot: string;
  currentRoot: string;
};

const fetchDataOnChain = async (provider: any, distributor: string): Promise<OnChainParams> => {
  const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', provider);
  const distributorInterface = Distributor__factory.createInterface();

  const calls = [
    {
      callData: distributorInterface.encodeFunctionData('disputeToken'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('disputeAmount'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('disputePeriod'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('endOfDisputePeriod'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('disputer'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('tree'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('lastTree'),
      target: distributor,
      allowFailure: false,
    },
    {
      callData: distributorInterface.encodeFunctionData('getMerkleRoot'),
      target: distributor,
      allowFailure: false,
    },
  ];

  const result = await multicall.callStatic.aggregate3(calls);

  return {
    disputeToken: distributorInterface.decodeFunctionResult('disputeToken', result[0].returnData)[0],
    disputeAmount: distributorInterface.decodeFunctionResult('disputeAmount', result[1].returnData)[0],
    disputePeriod: distributorInterface.decodeFunctionResult('disputePeriod', result[2].returnData)[0],
    endOfDisputePeriod: distributorInterface.decodeFunctionResult('endOfDisputePeriod', result[3].returnData)[0],
    disputer: distributorInterface.decodeFunctionResult('disputer', result[4].returnData)[0],
    endRoot: distributorInterface.decodeFunctionResult('tree', result[5].returnData)[0],
    startRoot: distributorInterface.decodeFunctionResult('lastTree', result[6].returnData)[0],
    currentRoot: distributorInterface.decodeFunctionResult('getMerkleRoot', result[7].returnData)[0],
  };
};

const triggerDispute = async (provider: any, reason: string, disputeToken: string, distributor: string, disputeAmount: BigNumber) => {
  const distributorContract = Distributor__factory.connect(distributor, provider);

  log('merkl dispute bot', `⚔️  triggering dispute because ${reason}`);
  const keeper = new Wallet(process.env.DISPUTE_BOT_PRIVATE_KEY, provider);
  log('merkl dispute bot', `🤖 bot address to dispute is ${keeper.address}`);
  /** _3-b might approve the contract */
  let tx = await Erc20__factory.connect(disputeToken, keeper).approve(distributorContract.address, disputeAmount);
  await tx.wait();
  log('merkl dispute bot', `✅ increased spender allowance`);
  /** _3-c dispute the tree */
  tx = await distributorContract.connect(keeper).disputeTree(reason);
  await tx.wait();
  log('merkl dispute bot', `✅ dispute triggered`);
};

router.get('', async (_, res) => {
  console.time('>>> [execution time]: ');
  const currentTimestamp = moment().unix();
  const chainId = getChainId();
  const provider = httpProvider(chainId);
  const distributor = registry(chainId).Merkl.Distributor;

  const onChainParams = await retryWithExponentialBackoff(fetchDataOnChain, 5, 500, provider, distributor);

  log(
    'merkl dispute bot',
    `\n---------------------------- \n` +
      `current time: ${moment.unix(currentTimestamp).format('DD MMM HH:mm:SS')} \n` +
      `dispute period: ${onChainParams.disputePeriod} hour(s) \n` +
      `end of dispute period: ${moment.unix(onChainParams.endOfDisputePeriod).format('DD MMM HH:mm:SS')} \n` +
      `dispute amount: ${onChainParams.disputeAmount.toNumber()} \n` +
      `dispute token: ${onChainParams.disputeToken} \n` +
      `current disputer: ${onChainParams.disputer} \n` +
      `tree root: ${onChainParams.endRoot} \n` +
      `last tree root: ${onChainParams.startRoot} \n` +
      `current root: ${onChainParams.currentRoot} \n` +
      `is dispute active?: ${currentTimestamp < onChainParams.endOfDisputePeriod} \n` +
      `----------------------------`
  );
  if (!!onChainParams.disputer && onChainParams.disputer !== NULL_ADDRESS) {
    log('merkl dispute bot', '✅ exiting because current tree is currently disputed');
    return res.status(200).json({ message: 'Tree already disputed' });
  } else if (onChainParams.disputeToken === NULL_ADDRESS) {
    log('merkl dispute bot', '✅ exiting because dispute token is not set');
    console.timeEnd('>>> [execution time]: ');
    return res.status(200).json({ message: 'No dispute token' });
  } else if (onChainParams.endOfDisputePeriod <= currentTimestamp) {
    log('merkl dispute bot', `✅ exiting because dispute period is over`);
    console.timeEnd('>>> [execution time]: ');
    return res.status(200).json({ message: 'Dispute period is over' });
  }

  /**
   * _2 Build dispute triggering function
   */

  log('merkl dispute bot', `🤖 tree update coming: from ${startRoot} to ${endRoot}`);

  /**
   * _2 🌴 Check recently uploaded tree consistency
   */
  /** _2_a fetch current and previous tree */
  const ts = new Transform({
    transform(chunk, enc, cb) {
      cb(null, chunk);
    },
  });
  const logger = new Console({ stdout: ts });

  await reportDiff(chainId, { MODE: 'ROOTS', endRoot: onChainParams.endRoot, startRoot: onChainParams.startRoot }, logger);

  const description = `Dispute Bot run on ${NETWORK_LABELS[chainId]}. Upgrade from ${onChainParams.startRoot} to ${onChainParams.endRoot}`;
  const url = await createGist(description, (ts.read() || '').toString());

  await sendSummary(description, true, url, []);

  const shouldTriggerDispute = false;
  const reason = '';

  if (shouldTriggerDispute) {
    retryWithExponentialBackoff(
      triggerDispute,
      5,
      500,
      provider,
      reason,
      onChainParams.disputeToken,
      distributor,
      onChainParams.disputeAmount
    );
  }
  console.timeEnd('>>> [execution time]: ');
  res.status(200).json({ exiting: 'ok' });
});
export default router;
