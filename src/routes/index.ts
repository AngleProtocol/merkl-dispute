import { ChainId, Distributor__factory, Erc20__factory, Multicall__factory, NETWORK_LABELS, registry } from '@angleprotocol/sdk';
import dotenv from 'dotenv';
import { BigNumber, ContractTransaction, utils, Wallet } from 'ethers';
import { Router } from 'express';
import moment from 'moment';

dotenv.config();

import { Console } from 'console';
import { Transform } from 'stream';

import { NULL_ADDRESS } from '../constants';
import { httpProvider } from '../providers';
import { reportDiff } from '../scripts/diff';
import { batchMulticallCall, createGist, getChainId, multicallContractCall, retryWithExponentialBackoff } from '../utils';
import { sendDiscordNotification } from '../utils/discord';
import { log } from '../utils/merkl';

const router = Router();

export type MerklIndexType = { [merklRoot: string]: number };

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

  const result = await batchMulticallCall(multicallContractCall, multicall, { data: calls });
  let i = 0;
  return {
    disputeToken: distributorInterface.decodeFunctionResult('disputeToken', result[i++])[0],
    disputeAmount: distributorInterface.decodeFunctionResult('disputeAmount', result[i++])[0],
    disputePeriod: distributorInterface.decodeFunctionResult('disputePeriod', result[i++])[0],
    endOfDisputePeriod: distributorInterface.decodeFunctionResult('endOfDisputePeriod', result[i++])[0],
    disputer: distributorInterface.decodeFunctionResult('disputer', result[i++])[0],
    endRoot: distributorInterface.decodeFunctionResult('tree', result[i++])[0],
    startRoot: distributorInterface.decodeFunctionResult('lastTree', result[i++])[0],
    currentRoot: distributorInterface.decodeFunctionResult('getMerkleRoot', result[i])[0],
  };
};

const triggerDispute = async (
  provider: any,
  chainId: ChainId,
  reason: string,
  disputeToken: string,
  distributor: string,
  disputeAmount: BigNumber
) => {
  const distributorContract = Distributor__factory.connect(distributor, provider);

  log('merkl dispute bot', `⚔️  triggering dispute because ${reason}`);
  const keeper = new Wallet(process.env.DISPUTE_BOT_PRIVATE_KEY, provider);
  log('merkl dispute bot', `🤖 bot ${keeper.address} is disputing`);

  let tx: ContractTransaction;
  /** _3-b might approve the contract */
  try {
    tx = await Erc20__factory.connect(disputeToken, keeper).approve(
      distributorContract.address,
      disputeAmount,
      chainId === ChainId.POLYGON ? { maxPriorityFeePerGas: utils.parseUnits('50', 9), maxFeePerGas: utils.parseUnits('350', 9) } : {}
    );
    await tx.wait();
    log('merkl dispute bot', `✅ increased spender allowance`);
  } catch (e) {
    log('merkl dispute bot', `❌ couldn't approve spender`);
    await sendDiscordNotification({
      title: `❌ TX ERROR: "approve" transaction for token ${disputeToken} failed`,
      description: `${e}`,
      isAlert: true,
      severity: 'error',
      fields: [],
      key: 'merkl dispute bot',
    });
  }

  /** _3-c dispute the tree */
  try {
    tx = await distributorContract
      .connect(keeper)
      .disputeTree(
        reason,
        chainId === ChainId.POLYGON ? { maxPriorityFeePerGas: utils.parseUnits('50', 9), maxFeePerGas: utils.parseUnits('350', 9) } : {}
      );
    await tx.wait();
    log('merkl dispute bot', `✅ dispute triggered`);
  } catch (e) {
    log('merkl dispute bot', `❌ couldn't trigger dispute`);
    await sendDiscordNotification({
      title: `❌ TX ERROR: "disputeTree" transaction failed`,
      description: `${e}`,
      isAlert: true,
      severity: 'error',
      fields: [],
      key: 'merkl dispute bot',
    });
  }

  await sendDiscordNotification({
    title: `🎉 SUCCESSFULLY disputed tree`,
    description: ``,
    isAlert: true,
    severity: 'warning',
    fields: [],
    key: 'merkl dispute bot',
  });
};

router.get('', async (_, res) => {
  console.time('>>> [execution time]: ');
  const currentTimestamp = moment().unix();
  const chainId = getChainId();
  const provider = httpProvider(chainId);
  const distributor = registry(chainId).Merkl.Distributor;

  let onChainParams: OnChainParams;
  try {
    onChainParams = await retryWithExponentialBackoff(fetchDataOnChain, 5, 500, provider, distributor);
  } catch (e) {
    await sendDiscordNotification({
      title: `Dispute Bot - ${NETWORK_LABELS[chainId]}`,
      description: `Couldn't fetch on-chain data because: \n ${e}`,
      isAlert: false,
      severity: 'warning',
      fields: [],
      key: 'merkl dispute bot',
    });
    return res.status(500).json({ message: "Couldn't fetch on-chain data" });
  }

  log(
    'merkl dispute bot',
    `\n---------------------------- \n` +
      `current time: ${moment.unix(currentTimestamp + 2 * 3_600).format('DD MMM HH:mm:SS')} \n` +
      `dispute period: ${onChainParams.disputePeriod} hour(s) \n` +
      `last dispute period ended at: ${moment.unix(onChainParams.endOfDisputePeriod + 2 * 3_600).format('DD MMM HH:mm:SS')} \n` +
      `dispute amount: ${onChainParams.disputeAmount.toString()} \n` +
      `dispute token: ${onChainParams.disputeToken} \n` +
      `current disputer: ${onChainParams.disputer} \n` +
      `tree root: ${onChainParams.endRoot} \n` +
      `last tree root: ${onChainParams.startRoot} \n` +
      `current root: ${onChainParams.currentRoot} \n` +
      `is dispute active?: ${currentTimestamp < onChainParams.endOfDisputePeriod} \n` +
      `----------------------------`
  );
  // Check the values and continue only if the dispute period is active
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

  log('merkl dispute bot', `🤖 tree update coming: change ${onChainParams.startRoot} to ${onChainParams.endRoot}`);

  // Save logs of `reportDiff` to then build a gist
  const ts = new Transform({
    transform(chunk, _, cb) {
      cb(null, chunk);
    },
  });
  const logger = new Console({ stdout: ts });

  let error: boolean, reason: string;
  try {
    const res = await retryWithExponentialBackoff(
      async () => {
        return await reportDiff(chainId, { MODE: 'ROOTS', endRoot: onChainParams.endRoot, startRoot: onChainParams.startRoot }, logger);
      },
      5,
      1000
    );
    error = res.error;
    reason = res.reason;
  } catch (e) {
    log('merkl dispute bot', `❌ unable to run testing: ${e}`);
    error = true;
    reason = 'unable to run testing';
  }
  log('error', `${error}`);

  const description = `Dispute Bot - ${NETWORK_LABELS[chainId]} \n Upgrade from ${onChainParams.startRoot} to ${onChainParams.endRoot}`;

  let url = 'no diff checker report';
  try {
    url = await createGist(description, (ts.read() || '').toString());
  } catch (e) {
    log('merkl dispute bot', `❌ unable to create gist: ${e}`);
    error = true;
    reason = !!reason ? reason + ' - ' : '' + 'Unable to create gist';
  }
  log('merkl dispute bot', `🔗 gist url: ${url}`);

  if (!!reason && reason !== '') {
    log('reason', reason);
  }

  if (error) {
    await sendDiscordNotification({
      title: `🚸 ERROR DETECTED - TRYING DISPUTE`,
      description: `GIST: ${url} \n` + reason,
      isAlert: true,
      severity: 'warning',
      fields: [],
      key: 'merkl dispute bot',
    });
    if (process.env.ENV === 'prod') {
      retryWithExponentialBackoff(
        triggerDispute,
        5,
        1000,
        provider,
        chainId,
        reason,
        onChainParams.disputeToken,
        distributor,
        onChainParams.disputeAmount
      );
    }
  } else {
    await sendDiscordNotification({
      title: '🎉 SUCCESS: ' + description,
      description: `GIST: ${url} \n` + reason,
      isAlert: false,
      severity: 'info',
      fields: [],
      key: 'merkl dispute bot',
    });
  }
  console.timeEnd('>>> [execution time]: ');
  res.status(200).json({ exiting: 'ok' });
});
export default router;
