import { AggregatedRewardsType, Distributor__factory, Erc20__factory, registry } from '@angleprotocol/sdk';
import axios, { AxiosResponse } from 'axios';
import { BigNumber, Wallet } from 'ethers';
import { Router } from 'express';
import moment from 'moment';

import { NULL_ADDRESS } from '../constants'; //OK
import { httpProvider } from '../providers'; //OK
import { getChainId, getEnv } from '../utils'; // OK
import { computeAccumulatedRewardSinceInception, log } from '../utils/merkl'; // OK

export type MerklIndexType = { [merklRoot: string]: number };

const router = Router();

// 2. optimize different network calls ✅
// - use withRetry for all network calls ✅
// - see potential improvements from flashbot / chainstack wrap tx
// -- @Picodes add discord messaging

router.get('', async (_, res) => {
  console.time('>>> [execution time]: ');
  const currentTimestamp = moment().unix();
  const chainId = getChainId();
  const env = getEnv();
  const githubURL = `https://raw.githubusercontent.com/AngleProtocol/merkl-rewards/${env !== 'prod' ? 'staging' : 'main'}/`;
  const distributorContract = Distributor__factory.connect(registry(chainId).Merkl.Distributor, httpProvider(chainId));
  /**
   * _1 Checks whether there is a current disputer and whether the dispute period is over
   */
  // TODO parallelize network calls
  let disputePeriod: number;
  let disputeAmount: BigNumber;
  let disputeToken: string;
  let disputer: string;
  let endOfDisputePeriod: number;
  await Promise.all([
    distributorContract.disputePeriod().then((res) => {
      disputePeriod = res;
    }),
    distributorContract.disputeAmount().then((res) => {
      disputeAmount = res;
    }),
    distributorContract.disputeToken().then((res) => {
      disputeToken = res;
    }),
    distributorContract.disputer().then((res) => {
      disputer = res;
    }),
    distributorContract.endOfDisputePeriod().then((res) => {
      endOfDisputePeriod = res;
    }),
  ]);
  log(
    'merkl dispute bot',
    `\n---------------------------- \n` +
      `current time: ${currentTimestamp} \n` +
      `dispute period: ${disputePeriod} hour(s) \n` +
      `dispute amount: ${disputeAmount} \n` +
      `dispute token: ${disputeToken} \n` +
      `current disputer: ${disputer} \n` +
      `is dispute active?: ${currentTimestamp < endOfDisputePeriod} \n` +
      `----------------------------`
  );
  if (!!disputer && disputer !== NULL_ADDRESS) {
    log('merkl dispute bot', '✅ exiting because current tree is currenyl disputed');
    return res.status(200).json({ message: 'Tree already disputed' });
  } else if (disputeToken === NULL_ADDRESS) {
    log('merkl dispute bot', '✅ exiting because dispute token is not set');
    console.timeEnd('>>> [execution time]: ');
    return res.status(200).json({ message: 'No dispute token' });
  } else if (endOfDisputePeriod <= currentTimestamp) {
    log('merkl dispute bot', `✅ exiting because dispute period is over`);
    console.timeEnd('>>> [execution time]: ');
    return res.status(200).json({ message: 'Dispute period is over' });
  }
  log('merkl dispute bot', '🤖 dispute is trigerrable');
  /**
   * _2 🌴 Check recently uploaded tree consistency
   */
  /** _2_a fetch current and previous tree */
  let pendingRewards: AggregatedRewardsType['rewards'];
  let pendingRewardsRoot: string;
  let lastUpdateEpoch: number;
  let index: MerklIndexType;
  let currentMerklRoot: string;
  await Promise.all([
    axios
      .get<AggregatedRewardsType>(githubURL + `${chainId + `/rewards.json`}`, {
        timeout: 5000,
      })
      .then((res) => {
        pendingRewards = res.data.rewards;
        lastUpdateEpoch = res.data.lastUpdateEpoch;
        pendingRewardsRoot = res.data.merklRoot;
      }),
    axios
      .get<MerklIndexType>(githubURL + `${chainId + `/index.json`}`, {
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
    githubURL + `${chainId + `/backup/rewards_${currentRootUpdateEpoch}.json`}`,
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
  }
  console.timeEnd('>>> [execution time]: ');
  res.status(200).json({ exiting: 'ok' });
});
export default router;
