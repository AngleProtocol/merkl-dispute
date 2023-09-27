import { Console } from 'console';
import moment from 'moment';
import { Transform } from 'stream';

import { NULL_ADDRESS } from '../constants';
import { buildMerklTree, round } from '../helpers';
import { createGist } from '../helpers/createGist';
import { BotError, MerklReport, Resolver, Result, Step, StepResult } from '../types/bot';
import { HoldersReport } from '../types/holders';
import { DisputeContext } from './context';
import dispute from './dispute';
import { validateClaims, validateHolders } from './validity';

const checkBlockTime: Step = async (context, report, resolve) => {
  try {
    const { onChainProvider, blockNumber, logger } = context;
    const timestamp = !!blockNumber ? await onChainProvider.fetchTimestampAt(blockNumber) : moment().unix();
    const block = blockNumber ?? (await onChainProvider.mountLastBlock());

    logger?.context(context, timestamp);

    return { ...report, blockNumber: block, startTime: timestamp };
  } catch (err) {
    resolve(Result.Error({ code: BotError.BlocktimeFetch, reason: 'No check', report }));
  }
};

const checkOnChainParams: Step = async ({ onChainProvider, logger }, report, resolve) => {
  try {
    onChainProvider.setBlock(report.blockNumber);
    const params = await onChainProvider.fetchOnChainParams();

    logger?.onChainParams(params, report.startTime);

    return { ...report, params };
  } catch (err) {
    resolve(Result.Error({ code: BotError.OnChainFetch, reason: 'No check', report }));
  }
};

const checkDisputeWindow: Step = async (context, report, resolve) => {
  try {
    const { startTime } = report;
    const { disputer, disputeToken, endOfDisputePeriod } = report?.params;

    if (!!disputer && disputer !== NULL_ADDRESS) resolve(Result.Exit({ reason: 'Already disputed', report }));
    else if (disputeToken === NULL_ADDRESS) resolve(Result.Exit({ reason: 'No dispute token set', report }));
    else if (endOfDisputePeriod <= startTime) resolve(Result.Exit({ reason: 'Not in dispute period', report }));
    return report;
  } catch (err) {
    resolve(Result.Error({ code: BotError.OnChainFetch, reason: 'No check', report }));
  }
};

const checkEpochs: Step = async ({ merkleRootsProvider }, report, resolve) => {
  try {
    const { startRoot, endRoot } = report.params;

    const startEpoch = await merkleRootsProvider.fetchEpochFor(startRoot);
    const endEpoch = await merkleRootsProvider.fetchEpochFor(endRoot);

    return { ...report, startEpoch, endEpoch };
  } catch (err) {
    resolve(Result.Error({ code: BotError.EpochFetch, reason: 'No check', report }));
  }
};

const checkTrees: Step = async ({ merkleRootsProvider, logger }, report, resolve) => {
  try {
    const { startEpoch, endEpoch } = report;

    const startTree = await merkleRootsProvider.fetchTreeFor(startEpoch);
    const endTree = await merkleRootsProvider.fetchTreeFor(endEpoch);

    logger?.trees(startEpoch, startTree, endEpoch, endTree);

    return { ...report, startTree, endTree };
  } catch (err) {
    resolve(Result.Error({ code: BotError.TreeFetch, reason: 'No check', report }));
  }
};

const checkRoots: Step = async ({ logger }, report, resolve) => {
  try {
    const { startTree, endTree } = report;

    const startRoot = buildMerklTree(startTree.rewards).tree.getHexRoot();
    const endRoot = buildMerklTree(endTree.rewards).tree.getHexRoot();

    logger?.computedRoots(startRoot, endRoot);

    if (startRoot !== startTree.merklRoot) throw 'Start merkle root is not correct';
    if (endRoot !== endTree.merklRoot) throw 'End merkle root is not correct';
    else return { ...report, startRoot, endRoot };
  } catch (reason) {
    resolve(Result.Error({ code: BotError.TreeRoot, reason, report }));
  }
};

const checkHolderValidity: Step = async ({ onChainProvider }, report, resolve) => {
  let holdersReport: HoldersReport;

  try {
    const { startTree, endTree } = report;
    holdersReport = await validateHolders(onChainProvider, startTree, endTree);
    const negativeDiffs = holdersReport.negativeDiffs;

    if (negativeDiffs.length > 0) throw negativeDiffs.join('\n');

    return { ...report, holdersReport };
  } catch (reason) {
    resolve(Result.Error({ code: BotError.NegativeDiff, reason, report: { ...report, holdersReport } }));
  }
};

const checkOverclaimedRewards: Step = async ({ onChainProvider }, report, resolve) => {
  let expandedHoldersReport: HoldersReport;

  try {
    const { holdersReport } = report;
    expandedHoldersReport = await validateClaims(onChainProvider, holdersReport);
    const overclaims = expandedHoldersReport.overclaimed;

    if (overclaims.length > 0) throw overclaims.join('\n');

    return { ...report, holdersReport: expandedHoldersReport };
  } catch (reason) {
    resolve(Result.Error({ code: BotError.AlreadyClaimed, reason, report: { ...report, holdersReport: expandedHoldersReport } }));
  }
};

const createDiffTable = async (report) => {
  try {
    const ts = new Transform({
      transform(chunk, _, cb) {
        cb(null, chunk);
      },
    });
    const output = new Console({ stdout: ts });
    const details = report.holdersReport.details;
    const changePerDistrib = report.holdersReport.changePerDistrib;

    output.table(details, [
      'holder',
      'diff',
      'symbol',
      'poolName',
      'distribution',
      'percent',
      'diffAverageBoost',
      'totalCumulated',
      'alreadyClaimed',
      'issueSpotted',
    ]);

    output.table(
      Object.keys(changePerDistrib)
        .map((k) => {
          return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
        })
        .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
    );

    return await createGist('A gist', (ts.read() || '').toString());
  } catch (err) {
    return undefined;
  }
};

export async function checkUpOnMerkl(context: DisputeContext): Promise<StepResult> {
  return new Promise(async function (resolve: Resolver) {
    let report: MerklReport = {};

    report = await checkBlockTime(context, report, resolve);
    report = await checkOnChainParams(context, report, resolve);
    report = await checkDisputeWindow(context, report, resolve);
    report = await checkEpochs(context, report, resolve);
    report = await checkTrees(context, report, resolve);
    report = await checkRoots(context, report, resolve);
    report = await checkHolderValidity(context, report, resolve);
    report = await checkOverclaimedRewards(context, report, resolve);

    resolve(Result.Exit({ reason: 'No problemo', report }));
  });
}

export default async function run(context: DisputeContext) {
  const { logger } = context;
  const checkUpResult = await checkUpOnMerkl(context);
  const diffTableUrl = await createDiffTable(checkUpResult.res.report);

  checkUpResult.res.report.diffTableUrl = diffTableUrl;

  if (!checkUpResult.err) {
    logger?.success(context, checkUpResult.res.reason, checkUpResult.res.report);
    return;
  }

  logger?.error(context, checkUpResult.res.reason, checkUpResult.res.code, checkUpResult.res.report);

  const disputeResult = await dispute(context, checkUpResult.res.report);

  if (!disputeResult.err) {
    logger?.success(context, disputeResult.res.reason, disputeResult.res.report);
    return;
  }

  logger?.error(context, disputeResult.res.reason, disputeResult.res.code, disputeResult.res.report);
}
