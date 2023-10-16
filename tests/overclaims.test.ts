import { expect } from 'chai';
import { describe, it } from 'node:test';

import { DisputeContext } from '../src/bot/context';
import { checkOverclaimedRewards } from '../src/bot/runner';
import ConsoleLogger from '../src/helpers/logger/ConsoleLogger';
import { BotError, MerklReport, Resolver, StepResult } from '../src/types/bot';
import ManualChainProvider from './helpers/ManualChainProvider';
import ManualMerkleRootsProvider from './helpers/ManualMerkleRootsProvider';
import { createActiveDistribution, createClaims, createTree } from './helpers/testData';

describe('Overclaim detections', async function () {
  it('Should catch on holder having overclaimed', async function () {
    const testReport: MerklReport = {
      startTree: createTree('1000000000000000000000'),
      endTree: createTree('1000000000000000000000'),
    };

    const testContext: DisputeContext = {
      chainId: 1,
      blockNumber: 0,
      logger: new ConsoleLogger(),
      onChainProvider: new ManualChainProvider(
        createActiveDistribution,
        () => createClaims('1000000000000000000001'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    expect(
      await new Promise(async function (resolve) {
        const result = (res: StepResult) => {
          if (!res.err) resolve(false);
          if (res.err && res.res.code === BotError.AlreadyClaimed) resolve(true);
          resolve(false);
        };

        await result(await checkOverclaimedRewards(testContext, testReport));
        resolve(false);
      })
    ).to.equal(true);
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
        () => createClaims('1000000000000000000000'),
        () => 'PESOS-STERLING'
      ),
      merkleRootsProvider: new ManualMerkleRootsProvider(),
    };

    expect(
      await new Promise(async function (resolve) {
        const result = (res: StepResult) => {
          if (!res.err) resolve(false);
          if (res.err && res.res.code === BotError.AlreadyClaimed) resolve(true);
          resolve(false);
        };

        await result(await checkOverclaimedRewards(testContext, testReport));
        resolve(false);
      })
    ).to.equal(true);
  });
});
