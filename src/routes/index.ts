import { AggregatedRewardsType, Distributor__factory, Erc20__factory, Multicall__factory, registry } from '@angleprotocol/sdk';
import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { BigNumber, Wallet } from 'ethers';
import { Router } from 'express';
import moment from 'moment';

dotenv.config();

import { GITHUB_URL, NULL_ADDRESS } from '../constants';
import { httpProvider } from '../providers';
import { reportDiff } from '../scripts/diff';
import { createGist, getChainId } from '../utils';
import { computeAccumulatedRewardSinceInception, log } from '../utils/merkl';

export type MerklIndexType = { [merklRoot: string]: number };

const router = Router();

router.get('', async (_, res) => {
  console.time('>>> [execution time]: ');
  const currentTimestamp = moment().unix();
  const chainId = getChainId();
  const provider = httpProvider(chainId);
  const multicall = Multicall__factory.connect('0xcA11bde05977b3631167028862bE2a173976CA11', provider);
  const distributorInterface = Distributor__factory.createInterface();
  const distributor = registry(chainId).Merkl.Distributor;
  const distributorContract = Distributor__factory.connect(distributor, provider);

  /**
   * _1 Fetch data from the distributor contract
   */
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

  const disputeToken = distributorInterface.decodeFunctionResult('disputeToken', result[0].returnData)[0];
  const disputeAmount = distributorInterface.decodeFunctionResult('disputeAmount', result[1].returnData)[0];
  const disputePeriod = distributorInterface.decodeFunctionResult('disputePeriod', result[2].returnData)[0];
  const endOfDisputePeriod = distributorInterface.decodeFunctionResult('endOfDisputePeriod', result[3].returnData)[0];
  const disputer = distributorInterface.decodeFunctionResult('disputer', result[4].returnData)[0];
  const endRoot = distributorInterface.decodeFunctionResult('tree', result[5].returnData)[0];
  const startRoot = distributorInterface.decodeFunctionResult('lastTree', result[6].returnData)[0];
  const currentRoot = distributorInterface.decodeFunctionResult('getMerkleRoot', result[7].returnData)[0];

  log(
    'merkl dispute bot',
    `\n---------------------------- \n` +
      `current time: ${moment.unix(currentTimestamp).format('DD MMM HH:mm:SS')} \n` +
      `dispute period: ${disputePeriod} hour(s) \n` +
      `end of dispute period: ${moment.unix(endOfDisputePeriod).format('DD MMM HH:mm:SS')} \n` +
      `dispute amount: ${disputeAmount} \n` +
      `dispute token: ${disputeToken} \n` +
      `current disputer: ${disputer} \n` +
      `tree root: ${endRoot} \n` +
      `last tree root: ${startRoot} \n` +
      `current root: ${currentRoot} \n` +
      `is dispute active?: ${currentTimestamp < endOfDisputePeriod} \n` +
      `----------------------------`
  );
  if (!!disputer && disputer !== NULL_ADDRESS) {
    log('merkl dispute bot', '✅ exiting because current tree is currently disputed');
    return res.status(200).json({ message: 'Tree already disputed' });
  } else if (disputeToken === NULL_ADDRESS) {
    log('merkl dispute bot', '✅ exiting because dispute token is not set');
    console.timeEnd('>>> [execution time]: ');
    return res.status(200).json({ message: 'No dispute token' });
    // } else if (endOfDisputePeriod <= currentTimestamp) {
    //   log('merkl dispute bot', `✅ exiting because dispute period is over`);
    //   console.timeEnd('>>> [execution time]: ');
    //   return res.status(200).json({ message: 'Dispute period is over' });
  }

  /**
   * _2 Build dispute triggering function
   */
  const triggerDispute = async (reason: string) => {
    log('merkl dispute bot', `⚔️  triggering dispute because ${reason}`);
    const keeper = new Wallet(process.env.DISPUTE_BOT_PRIVATE_KEY, httpProvider(chainId));
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

  log('merkl dispute bot', `🤖 tree update coming: from ${startRoot} to ${endRoot}`);

  /**
   * _2 🌴 Check recently uploaded tree consistency
   */
  /** _2_a fetch current and previous tree */

  let logs = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs += args.join(' ') + '\n';
    originalLog.apply(console, args);
  };

  // TODO Add positing of the gist on discord
  // TODO Add that if we can't fetch the tree for some reason we need to dispute
  await reportDiff(chainId, { MODE: 'ROOTS', endRoot, startRoot });
  await createGist(logs);

  console.log = originalLog;

  let pendingRewards: AggregatedRewardsType['rewards'];
  let pendingRewardsRoot: string;
  let lastUpdateEpoch: number;
  let index: MerklIndexType;
  let currentMerklRoot: string;
  await Promise.all([
    axios
      .get<AggregatedRewardsType>(GITHUB_URL + `${chainId + `/rewards.json`}`, {
        timeout: 5000,
      })
      .then((res) => {
        pendingRewards = res.data.rewards;
        lastUpdateEpoch = res.data.lastUpdateEpoch;
        pendingRewardsRoot = res.data.merklRoot;
      }),
    axios
      .get<MerklIndexType>(GITHUB_URL + `${chainId + `/index.json`}`, {
        timeout: 5000,
      })
      .then((res) => {
        index = res.data;
      }),
    distributorContract.getMerkleRoot().then((res) => {
      currentMerklRoot = res;
    }),
  ]);
  log(
    'merkl dispute bot',
    `\n--------------------------------------------------------\n` +
      `🌴 incoming tree root: ${pendingRewardsRoot}\n` +
      `⏱️  incoming tree pushed at epoch: ${lastUpdateEpoch}\n` +
      `----------------------------\----------------------------`
  );
  // log('merkl dispute bot', `🌴 current merkl root: ${currentMerklRoot}\n`);
  /** 2_b Find epoch associated with current rewards */
  let currentRootUpdateEpoch: number;
  for (const merklRoot of Object.keys(index)) {
    if (merklRoot === currentMerklRoot) {
      currentRootUpdateEpoch = index[merklRoot];
    }
  }
  log(
    'merkl dispute bot',
    `\n--------------------------------------------------------\n` +
      `🌴 current merkl root: ${currentMerklRoot}\n` +
      `⏱️  last valid root update at epoch ${currentRootUpdateEpoch}\n` +
      `--------------------------------------------------------\n`
  );
  // console.log(githubURL + `${chainId + `/backup/rewards_${currentRootUpdateEpoch}.json`}`);
  const call: AxiosResponse = await axios.get<AggregatedRewardsType>(
    GITHUB_URL + `${chainId + `/backup/rewards_${currentRootUpdateEpoch}.json`}`,
    {
      timeout: 5000,
    }
  );
  const currentRewards = call.data.rewards as AggregatedRewardsType['rewards'];

  /**
   *  _3 If there is an anomaly, dispute the tree
   */
  let shouldTriggerDispute = false;
  let reason: string;
  /** _3-a compare current and previous tree */
  for (const rewardId of Object.keys(currentRewards)) {
    if (!pendingRewards[rewardId]) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: old rewardId not found in incoming rewards`;
      break;
    }
    if (currentRewards[rewardId].amm !== pendingRewards[rewardId].amm) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: amm type are not the same`;
      break;
    }
    if (currentRewards[rewardId].boostedAddress !== pendingRewards[rewardId].boostedAddress) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: boosted address are not the same`;
      break;
    }
    if (currentRewards[rewardId].boostedReward !== pendingRewards[rewardId].boostedReward) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: boosted reward are not the same`;
      break;
    }
    if (currentRewards[rewardId].pool !== pendingRewards[rewardId].pool) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: pool are not the same`;
      break;
    }
    if (currentRewards[rewardId].token !== pendingRewards[rewardId].token) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: reward token are not the same`;
      break;
    }
    if (currentRewards[rewardId].tokenDecimals !== pendingRewards[rewardId].tokenDecimals) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: token decimals are not the same`;
      break;
    }
    if (currentRewards[rewardId].tokenSymbol !== pendingRewards[rewardId].tokenSymbol) {
      shouldTriggerDispute = true;
      reason = `[${rewardId.slice(2, 20)}]: token symbol are not the same`;
      break;
    }
    if (
      parseInt(computeAccumulatedRewardSinceInception(currentRewards[rewardId])) <
      parseInt(computeAccumulatedRewardSinceInception(pendingRewards[rewardId]))
    ) {
      shouldTriggerDispute = true;
      reason = 'total amount should increase between two updates';
      break;
    }
  }
  shouldTriggerDispute = !!shouldTriggerDispute && !!reason && reason !== '';
  log('merkl dispute bot', `⚔️  should trigger dispute? ${shouldTriggerDispute}`);
  if (!!shouldTriggerDispute) {
    triggerDispute(reason);
  }
  console.timeEnd('>>> [execution time]: ');
  res.status(200).json({ exiting: 'ok' });
});
export default router;
