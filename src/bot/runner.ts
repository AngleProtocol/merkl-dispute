import moment from 'moment';

import { NULL_ADDRESS } from '../constants';
import { buildMerklTree } from '../helpers';
import createDiffTable from '../helpers/diffTable';
import { BotError, MerklReport, Resolver, Result, Step, StepResult } from '../types/bot';
import { HoldersReport } from '../types/holders';
import { DisputeContext } from './context';
import { approveDisputeStake, createSigner, disputeTree } from './dispute';
import { validateClaims, validateHolders } from './validity';

export const checkBlockTime: Step = async (context, report) => {
  try {
    const { onChainProvider, blockNumber, logger } = context;
    const timestamp = !!blockNumber ? await onChainProvider.fetchTimestampAt(blockNumber) : moment().unix();
    const block = blockNumber ?? (await onChainProvider.mountLastBlock());

    logger?.context(context, timestamp);

    return Result.Success({ ...report, blockNumber: block, startTime: timestamp });
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
    return Result.Error({ code: BotError.OnChainFetch, reason: `Unable to get on-chain params: ${err}`, report });
  }
};

export const checkDisputeWindow: Step = async (context, report) => {
  try {
    const { startTime } = report;
    const { disputer, disputeToken, endOfDisputePeriod } = report?.params;

    if (!!disputer && disputer !== NULL_ADDRESS) return Result.Exit({ reason: 'Already disputed', report });
    else if (disputeToken === NULL_ADDRESS) return Result.Exit({ reason: 'No dispute token set', report });
    else if (endOfDisputePeriod <= startTime) return Result.Exit({ reason: 'Not in dispute period', report });
    return Result.Success(report);
  } catch (err) {
    return Result.Error({ code: BotError.OnChainFetch, reason: `Unable to check dispute status: ${err}`, report });
  }
};

export const checkEpochs: Step = async ({ merkleRootsProvider }, report) => {
  try {
    const { startRoot, endRoot } = report.params;

    const startEpoch = await merkleRootsProvider.fetchEpochFor(startRoot);
    const endEpoch = await merkleRootsProvider.fetchEpochFor(endRoot);

    return Result.Success({ ...report, startEpoch, endEpoch });
  } catch (err) {
    return Result.Error({ code: BotError.EpochFetch, reason: `Unable to get epochs: ${err}`, report });
  }
};

export const checkTrees: Step = async ({ merkleRootsProvider, logger }, report) => {
  try {
    const { startEpoch, endEpoch } = report;

    const startTree = await merkleRootsProvider.fetchTreeFor(startEpoch);
    const endTree = await merkleRootsProvider.fetchTreeFor(endEpoch);

    logger?.trees(startEpoch, startTree, endEpoch, endTree);

    return Result.Success({ ...report, startTree, endTree });
  } catch (err) {
    return Result.Error({ code: BotError.TreeFetch, reason: `Unable to get trees: ${err}`, report });
  }
};

export const checkRoots: Step = async ({ logger }, report) => {
  try {
    const { startTree, endTree } = report;

    const startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();
    const endRoot = buildMerklTree(endTree.rewards).tree.getHexRoot();

    logger?.computedRoots(startRoot, endRoot);

    if (startRoot !== startTree.merklRoot) throw 'Start merkle root is not correct';
    if (endRoot !== endTree.merklRoot) throw 'End merkle root is not correct';
    else return Result.Success({ ...report, startRoot, endRoot });
  } catch (reason) {
    return Result.Error({ code: BotError.TreeRoot, reason, report });
  }
};

export const checkHolderValidity: Step = async ({ onChainProvider }, report) => {
  let holdersReport: HoldersReport;

  try {
    const { startTree, endTree } = report;
    holdersReport = await validateHolders(onChainProvider, startTree, endTree);
    const negativeDiffs = holdersReport.negativeDiffs;

    if (negativeDiffs.length > 0) throw negativeDiffs.join('\n');

    return Result.Success({ ...report, holdersReport });
  } catch (reason) {
    return Result.Error({ code: BotError.NegativeDiff, reason, report: { ...report, holdersReport } });
  }
};

export const checkOverclaimedRewards: Step = async ({ onChainProvider }, report) => {
  let expandedHoldersReport: HoldersReport;

  try {
    const { holdersReport } = report;
    expandedHoldersReport = await validateClaims(onChainProvider, holdersReport);
    const overclaims = expandedHoldersReport.overclaimed;

    if (overclaims.length > 0) throw overclaims.join('\n');

    return Result.Success({ ...report, holdersReport: expandedHoldersReport });
  } catch (reason) {
    return Result.Error({ code: BotError.AlreadyClaimed, reason, report: { ...report, holdersReport: expandedHoldersReport } });
  }
};

export async function runSteps(
  context: DisputeContext,
  steps: Step[] = [
    checkBlockTime,
    checkOnChainParams,
    checkDisputeWindow,
    checkEpochs,
    checkTrees,
    checkRoots,
    checkHolderValidity,
    checkOverclaimedRewards,
  ],
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

    resolve(Result.Exit({ reason: 'No problemo', report }));
  });
}

export default async function run(context: DisputeContext) {
  const { logger } = context;
  let report: MerklReport;

  const checkUpResult = await runSteps(
    context,
    [
      checkBlockTime,
      checkOnChainParams,
      checkDisputeWindow,
      checkEpochs,
      checkTrees,
      checkRoots,
      checkHolderValidity,
      checkOverclaimedRewards,
    ],
    report
  );

  const holdersReport = checkUpResult?.res?.report?.holdersReport;

  if (holdersReport) {
    checkUpResult.res.report.diffTableUrl = await createDiffTable(
      holdersReport.details,
      holdersReport.changePerDistrib,
      !context.uploadDiffTable
    );
  }

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
