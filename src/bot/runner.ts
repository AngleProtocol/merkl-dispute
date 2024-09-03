import { HOUR, MerklChainId } from '@angleprotocol/sdk';
import moment from 'moment';

import { NULL_ADDRESS } from '../constants';
import { ALERTING_DELAY } from '../constants/alertingDelay';
import { BaseTree } from '../providers/tree';
import { BotError, MerklReport, Resolver, Result, Step, StepResult } from '../types/bot';
import { gtStrings } from '../utils/addString';
import { fetchCampaigns, fetchLeaves } from '../utils/merklAPI';
import { DisputeContext } from './context';
import { approveDisputeStake, createSigner, disputeTree } from './dispute';

export const checkBlockTime: Step = async (context, report) => {
  try {
    const { onChainProvider, blockNumber, logger, chainId } = context;
    const timestamp = !!blockNumber ? await onChainProvider.fetchTimestampAt(blockNumber) : moment().unix();
    const block = blockNumber ?? (await onChainProvider.mountLastBlock());

    logger?.context(context, timestamp);

    return Result.Success({ ...report, blockNumber: block, startTime: timestamp, chainId });
  } catch (err) {
    return Result.Error({ code: BotError.BlocktimeFetch, reason: `Unable to get block: ${err}`, report });
  }
};

export const checkOnChainParams: Step = async ({ onChainProvider, logger }, report) => {
  try {
    onChainProvider.setBlock(report.blockNumber);
    const params = await onChainProvider.fetchOnChainParams();

    logger?.onChainParams(params, report.startTime);

    return Result.Success({ ...report, params });
  } catch (err) {
    console.error(err);
    return Result.Error({ code: BotError.OnChainFetch, reason: `Unable to get on-chain params: ${err}`, report });
  }
};

export const checkDisputeWindow: Step = async (context, report) => {
  try {
    const { startTime } = report;
    const { disputer, disputeToken, endOfDisputePeriod } = report?.params;

    // if (!!disputer && disputer !== NULL_ADDRESS) return Result.Exit({ reason: 'Already disputed', report });
    // else
    // if (disputeToken === NULL_ADDRESS) return Result.Exit({ reason: 'No dispute token set', report });
    // else if (endOfDisputePeriod <= startTime) {
    //   // Check delay since last dispute period and eventually send an alert
    //   if (endOfDisputePeriod + ALERTING_DELAY[context.chainId] * HOUR <= startTime) {
    //     await context.logger.error(
    //       context,
    //       `Last update was ${((startTime - endOfDisputePeriod) / HOUR)?.toFixed(2)} hours ago`,
    //       BotError.AlertDelay
    //     );
    //   }
    //   return Result.Exit({ reason: 'Not in dispute period', report });
    // }
    return Result.Success(report);
  } catch (err) {
    return Result.Error({ code: BotError.OnChainFetch, reason: `Unable to check dispute status: ${err}`, report });
  }
};

export const checkTrees: Step = async ({ logger }, report) => {
  try {
    const { params, chainId } = report;

    const startRoot = params.startRoot;
    const endRoot = params.endRoot;

    const startLeaves = await fetchLeaves(chainId, startRoot);
    const startTree = new BaseTree(startLeaves, chainId as MerklChainId);

    startTree.buildMerklTree();

    const endLeaves = await fetchLeaves(chainId, endRoot);
    const endTree = new BaseTree(endLeaves, chainId as MerklChainId);

    endTree.buildMerklTree();

    return Result.Success({ ...report, startTree, endTree, startRoot, endRoot });
  } catch (err) {
    return Result.Error({ code: BotError.TreeFetch, reason: `Unable to get trees: ${err}`, report });
  }
};

export const checkRoots: Step = async ({ logger }, report) => {
  try {
    const { startTree, endTree, startRoot, endRoot } = report;

    const computedStartRoot = startTree.merklRoot();
    const computedEndRoot = endTree.merklRoot();
    logger?.computedRoots(computedStartRoot, computedEndRoot);

    if (startRoot !== computedStartRoot) throw 'Start merkle root is not correct';
    if (endRoot !== computedEndRoot) throw 'End merkle root is not correct';
    else return Result.Success({ ...report, startRoot, endRoot });
  } catch (reason) {
    return Result.Error({ code: BotError.TreeRoot, reason, report });
  }
};

export const checkOverDistribution: Step = async ({}, report) => {
  const { chainId, startTree, endTree } = report;

  try {
    const campaigns = await fetchCampaigns(chainId);

    const { diffCampaigns, diffRecipients, negativeDiffs } = BaseTree.computeDiff(startTree, endTree, campaigns);

    // if we are in the time period of unclaimed job
    //  -> test unclaimed
    //  -> test successful => discord notif
    //  -> test unsuccessful => throw
    // if not we throw
    if (negativeDiffs.length > 0) {
      return Result.Error({
        code: BotError.NegativeDiff,
        reason: negativeDiffs.join('\n'),
        report: { ...report, diffCampaigns, diffRecipients },
      });
    }

    const overDistributed = [];
    for (const diffCampaign of diffCampaigns) {
      if (gtStrings(diffCampaign.total, campaigns[diffCampaign.campaignId].amount)) {
        overDistributed.push(
          `${diffCampaign.campaignId} - Distributed (${diffCampaign.total}) > Total (${campaigns[diffCampaign.campaignId].amount})`
        );
      }
    }
    if (overDistributed.length > 0) {
      return Result.Error({
        code: BotError.OverDistributed,
        reason: overDistributed.join('\n'),
        report: { ...report, diffCampaigns, diffRecipients },
      });
    }

    return Result.Success({ ...report, diffCampaigns, diffRecipients });
  } catch (reason) {
    console.log(reason);
    return Result.Error({ code: BotError.NegativeDiff, reason, report: { ...report } });
  }
};

// export const checkHolderValidity: Step = async ({ onChainProvider }, report) => {
//   let holdersReport: HoldersReport;

//   try {
//     const { startTree, endTree } = report;
//     holdersReport = await validateHolders(onChainProvider, startTree, endTree);
//     const negativeDiffs = holdersReport.negativeDiffs;
//     const overDistributed = holdersReport.overDistributed;

//     if (negativeDiffs.length > 0) {
//       return Result.Error({ code: BotError.NegativeDiff, reason: negativeDiffs.join('\n'), report: { ...report, holdersReport } });
//     }
//     if (overDistributed.length > 0) {
//       return Result.Error({ code: BotError.OverDistributed, reason: overDistributed.join('\n'), report: { ...report, holdersReport } });
//     }

//     return Result.Success({ ...report, holdersReport });
//   } catch (reason) {
//     return Result.Error({ code: BotError.NegativeDiff, reason, report: { ...report, holdersReport } });
//   }
// };

// export const checkOverclaimedRewards: Step = async ({ onChainProvider }, report) => {
//   let expandedHoldersReport: HoldersReport;

//   try {
//     const { holdersReport } = report;
//     expandedHoldersReport = await validateClaims(onChainProvider, holdersReport);
//     const overclaims = expandedHoldersReport.overclaimed;

//     if (
//       overclaims?.filter((a) => {
//         try {
//           const add = a?.split(':')[0];
//           return !(ALLOWED_OVER_CLAIM?.includes(add?.toLowerCase()) || ALLOWED_OVER_CLAIM?.includes(getAddress(add)));
//         } catch {
//           return true;
//         }
//       }).length > 0
//     )
//       throw overclaims.join('\n');

//     return Result.Success({ ...report, holdersReport: expandedHoldersReport });
//   } catch (reason) {
//     return Result.Error({ code: BotError.AlreadyClaimed, reason, report: { ...report, holdersReport: expandedHoldersReport } });
//   }
// };

export async function runSteps(
  context: DisputeContext,
  steps: Step[] = [checkBlockTime, checkOnChainParams, checkDisputeWindow, checkTrees, checkRoots, checkOverDistribution],
  report: MerklReport = {}
): Promise<StepResult> {
  return new Promise(async function (resolve: Resolver) {
    let resolved = false;

    const handleStep = async (step: Step) => {
      const result = await step(context, report);

      if (result.exit) resolve(result);
      else report = result.res.report;

      resolved = result.exit;
    };

    for (let i = 0; i < steps.length && !resolved; i++) await handleStep(steps[i]);

    resolve(
      Result.Exit({
        reason: `No problem detected. Report at https://storage.cloud.google.com/merkl-production-reports/${context.chainId}/${report.endRoot}.html`,
        report,
      })
    );
  });
}

export default async function run(context: DisputeContext) {
  const { logger } = context;
  let report: MerklReport;

  const checkUpResult = await runSteps(
    context,
    [checkBlockTime, checkOnChainParams, checkDisputeWindow, checkTrees, checkRoots, checkOverDistribution],
    report
  );

  // const recipientReport = checkUpResult?.res?.report?.diffRecipients;

  // if (recipientReport) {
  //   checkUpResult.res.report.diffTableUrl = await createDiffTable(
  //     holdersReport.details,
  //     holdersReport.changePerDistrib,
  //     !context.uploadDiffTable
  //   );
  // }

  if (!checkUpResult.err) {
    await logger?.success(context, checkUpResult.res.reason, checkUpResult.res.report);
    return;
  }

  await logger?.error(context, checkUpResult.res.reason, checkUpResult.res.code, checkUpResult.res.report);

  const disputeResult = await runSteps(context, [createSigner, approveDisputeStake, disputeTree], checkUpResult.res.report);

  if (!disputeResult.err) {
    await logger?.disputeSuccess(context, disputeResult.res.reason, disputeResult.res.report);
    return;
  }

  await logger?.disputeError(context, disputeResult.res.reason, disputeResult.res.code, disputeResult.res.report);
}
