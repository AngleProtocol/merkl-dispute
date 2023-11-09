import { assert, expect } from 'chai';
import { describe, it } from 'node:test';

import { DisputeContext } from '../src/bot/context';
import { checkHolderValidity } from '../src/bot/runner';
import ConsoleLogger from '../src/helpers/logger/ConsoleLogger';
import { BotError, MerklReport, Resolver, StepResult } from '../src/types/bot';
import ManualChainProvider from './helpers/ManualChainProvider';
import ManualMerkleRootsProvider from './helpers/ManualMerkleRootsProvider';
import { createActiveDistribution, createClaims, createTree } from './helpers/testData';

describe('Errors in the differences between two trees', async function () {
  it('Should catch on holder having a negative diff', async function () {
    const testReport: MerklReport = {
      startTree: createTree('1000000000000000000000'),
      endTree: createTree('999999999999999999999'),
    };

    const testContext: DisputeContext = {
      chainId: 1,
      blockNumber: 0,
      logger: new ConsoleLogger(),
      onChainProvider: new ManualChainProvider(
        createActiveDistribution,
        (start: number, end: number) => createActiveDistribution(),
        () => createClaims('0'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    const report = await checkHolderValidity(testContext, testReport);

    expect(report.err).to.equal(true);
    report.err && expect(report.res.code).to.equal(BotError.NegativeDiff);
  });

  it('Should not catch a negative diff if none', async function () {
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
        (start: number, end: number) => createActiveDistribution(),
        () => createClaims('1000'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };
    const report = await checkHolderValidity(testContext, testReport);

    expect(report.err).to.equal(false);
  });
});
