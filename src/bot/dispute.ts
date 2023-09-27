import { ChainId } from '@angleprotocol/sdk';
import { utils, Wallet } from 'ethers';

import { BotError, MerklReport, Resolver, Result, Step, StepResult } from '../types/bot';
import { DisputeContext } from './context';

const createSigner: Step = async (context, report, resolve) => {
  try {
    const privateKey = process.env.DISPUTE_BOT_PRIVATE_KEY;

    if (!privateKey || privateKey === '') throw 'Signer not provided';

    const signer = new Wallet(privateKey);

    return { ...report, disputeReport: { signer } };
  } catch (reason) {
    resolve(Result.Error({ code: BotError.KeeperCreate, reason, report }));
  }
};

const approveDisputeStake: Step = async ({ onChainProvider, chainId }, report, resolve) => {
  try {
    const { disputeToken, disputeAmount } = report?.params;
    const { signer } = report?.disputeReport;

    const txnOverrides =
      chainId === ChainId.POLYGON
        ? {
            maxPriorityFeePerGas: utils.parseUnits('50', 9),
            maxFeePerGas: utils.parseUnits('350', 9),
          }
        : {};

    const approveReceipt = await onChainProvider.sendApproveTxn(signer, disputeToken, disputeAmount, txnOverrides);

    return { ...report, disputeReport: { ...report.disputeReport, approveReceipt } };
  } catch (reason) {
    resolve(
      Result.Error({
        code: BotError.KeeperApprove,
        reason,
        report,
      })
    );
  }
};

const disputeTree: Step = async ({ onChainProvider, chainId }, report, resolve) => {
  try {
    const { disputeToken, disputeAmount } = report?.params;
    const { signer } = report?.disputeReport;

    const txnOverrides =
      chainId === ChainId.POLYGON
        ? {
            maxPriorityFeePerGas: utils.parseUnits('50', 9),
            maxFeePerGas: utils.parseUnits('350', 9),
          }
        : {};

    const disputeReceipt = await onChainProvider.sendApproveTxn(signer, disputeToken, disputeAmount, txnOverrides);

    return { ...report, disputeReport: { ...report.disputeReport, disputeReceipt } };
  } catch (reason) {
    resolve(
      Result.Error({
        code: BotError.KeeperApprove,
        reason,
        report,
      })
    );
  }
};

export default async function dispute(context: DisputeContext, report: MerklReport): Promise<StepResult> {
  return new Promise(async function (resolve: Resolver) {
    report = await createSigner(context, report, resolve);
    report = await approveDisputeStake(context, report, resolve);
    report = await disputeTree(context, report, resolve);

    resolve(Result.Exit({ reason: 'No problemo', report }));
  });
}
