import { ChainId } from '@angleprotocol/sdk';
import { utils, Wallet } from 'ethers';

import { BotError, MerklReport, Resolver, Result, Step, StepResult } from '../types/bot';
import { DisputeContext } from './context';

export const createSigner: Step = async (context, report) => {
  try {
    const privateKey = process.env.DISPUTE_BOT_PRIVATE_KEY;

    if (!privateKey || privateKey === '') throw 'Signer not provided';

    const signer = new Wallet(privateKey);

    return Result.Success({ ...report, disputeReport: { signer } });
  } catch (reason) {
    return Result.Error({ code: BotError.KeeperCreate, reason, report });
  }
};

export const approveDisputeStake: Step = async ({ onChainProvider, chainId }, report) => {
  try {
    const { disputeToken, disputeAmount } = report?.params;
    const { signer } = report?.disputeReport;

    const approval = await onChainProvider.fetchApproval(signer.address, disputeToken);

    if (approval >= disputeAmount) return Result.Success(report);

    const txnOverrides =
      chainId === ChainId.POLYGON
        ? {
            maxPriorityFeePerGas: utils.parseUnits('50', 9),
            maxFeePerGas: utils.parseUnits('350', 9),
          }
        : {};

    const approveReceipt = await onChainProvider.sendApproveTxn(signer, disputeToken, disputeAmount, txnOverrides);

    return Result.Success({ ...report, disputeReport: { ...report.disputeReport, approveReceipt } });
  } catch (err) {
    return Result.Error({
      code: BotError.KeeperApprove,
      reason: err?.reason ?? "Couldn't send transaction",
      report,
    });
  }
};

export const disputeTree: Step = async ({ onChainProvider, chainId }, report) => {
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

    return Result.Success({ ...report, disputeReport: { ...report.disputeReport, disputeReceipt } });
  } catch (err) {
    return Result.Error({
      code: BotError.KeeperApprove,
      reason: err?.reason ?? "Couldn't send transaction",
      report,
    });
  }
};
