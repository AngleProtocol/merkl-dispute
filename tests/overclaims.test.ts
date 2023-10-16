import { expect } from 'chai';
import { describe, it } from 'node:test';

import { DisputeContext } from '../src/bot/context';
import { checkOverclaimedRewards } from '../src/bot/runner';
import ConsoleLogger from '../src/helpers/logger/ConsoleLogger';
import { BotError, MerklReport, Resolver, StepResult } from '../src/types/bot';
import ManualChainProvider from './helpers/ManualChainProvider';
import ManualMerkleRootsProvider from './helpers/ManualMerkleRootsProvider';
import { createActiveDistribution, createClaims, createTree } from './helpers/testData';
import { validateHolders } from '../src/bot/validity';

describe('Overclaim detections', async function () {
  it('Should catch on holder having overclaimed', async function () {
    const testReport: MerklReport = {
      startTree: createTree('1000000000000000000000'),
      endTree: createTree('1000000000000000000001'),
    };

    const testContext: DisputeContext = {
      chainId: 1,
      blockNumber: 0,
      logger: new ConsoleLogger(),
      onChainProvider: new ManualChainProvider(
        createActiveDistribution,
        () => createClaims('1001000000000000000000'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    const holdersReport = await checkHolderValidity(testContext, testReport);
    const report = await checkOverclaimedRewards(testContext, holdersReport.res.report);
    
    expect(report.err).to.equal(true);
    report.err && expect(report.res.code).to.equal(BotError.AlreadyClaimed);
  });

  it('Should not catch on holder not having overclaimed', async function () {
    const testReport: MerklReport = {
      startTree: createTree('1000000000000000000000'),
      endTree: createTree('1000000000000000000001'),
    };

    const testContext: DisputeContext = {
      chainId: 1,
      blockNumber: 0,
      logger: new ConsoleLogger(),
      onChainProvider: new ManualChainProvider(
        createActiveDistribution,
        () => createClaims('1000000000000000000002'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    const holdersReport = await validateHolders(testContext.onChainProvider, testReport.startTree, testReport.endTree);
    testReport.holdersReport = holdersReport;

    const report = await checkOverclaimedRewards(testContext, testReport);
    console.log(report);
    expect(report.err).to.equal(false);
  });
});
