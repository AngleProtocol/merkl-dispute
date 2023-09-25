import { ChainId, Distributor__factory } from '@angleprotocol/sdk';
import { ContractTransaction, utils, Wallet } from 'ethers';

import { OnChainParams } from '../providers/on-chain/OnChainProvider';
import { DisputeContext } from './context';
import { ERROR_KEEPER_WALLET } from './errors';
import { DisputeState } from './run';

const triggerDispute = async (params: OnChainParams, context: DisputeContext, state: DisputeState, title?: string) => {
  const { onChainProvider, chainId } = context;

  //Init keeper wallet
  let keeper: Wallet;
  try {
    keeper = new Wallet(process.env.DISPUTE_BOT_PRIVATE_KEY);
    console.log('merkl dispute bot', `🤖 bot ${keeper.address} is disputing`);
  } catch (err) {
    return { error: true, code: ERROR_KEEPER_WALLET, reason: "Couldn't init keeper wallet" };
  }

  //Approve disputeToken to contract
  let approveTxn: ContractTransaction;
  const txnOverrides =
    chainId === ChainId.POLYGON ? { maxPriorityFeePerGas: utils.parseUnits('50', 9), maxFeePerGas: utils.parseUnits('350', 9) } : {};

  /** _3-b might approve the contract */
  try {
    approveTxn = await onChainProvider.sendApproveTxn(keeper, params.disputeToken, params.disputeAmount, txnOverrides);
    console.log('merkl dispute bot', `approved dispute token at ${approveTxn.hash}`);
  } catch (err) {
    console.log('merkl dispute bot', `❌ couldn't approve spender`, err);
  }

  //Dispute tree
  let disputeTxn: ContractTransaction;

  /** _3-c dispute the tree */
  try {
    disputeTxn = await onChainProvider.sendDisputeTxn(keeper, state.reason, txnOverrides);

    console.log('merkl dispute bot', `✅ dispute triggered at ${disputeTxn.hash}`);
  } catch (err) {
    console.log('merkl dispute bot', `❌ couldn't trigger dispute`, err);
    // await sendDiscordNotification({
    //   title: `❌ TX ERROR: "disputeTree" transaction failed \n` + title,
    //   description: `Error can be found in cloud run logs`,
    //   isAlert: true,
    //   severity: 'error',
    //   fields: [],
    //   key: 'merkl dispute bot',
    // });
  }

  //   await sendDiscordNotification({
  //     title: `🎉 SUCCESSFULLY disputed tree \n` + title,
  //     description: `tx hash: ${txn.hash}`,
  //     isAlert: true,
  //     severity: 'warning',
  //     fields: [],
  //     key: 'merkl dispute bot',
  //   });
};

export default triggerDispute;
