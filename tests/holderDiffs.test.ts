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
        () => createClaims('0'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    expect(
      await new Promise(async function (resolve) {
        const result = (res: StepResult) => {
          expect(res.err).to.equal(true);
          res.err && expect(res.res.code).to.equal(BotError.NegativeDiff);
          resolve(true);
        };

        await result(await checkHolderValidity(testContext, testReport));
        resolve(false);
      })
    ).to.equal(true);
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
        () => createClaims('1000'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    expect(
      await new Promise(async function (resolve) {
        // If result triggered than an error occured
        const result = (res: StepResult) => {
          resolve(false);
        };

        await result(await checkHolderValidity(testContext, testReport));
        resolve(true);
      })
    ).to.equal(true);
  });
});
