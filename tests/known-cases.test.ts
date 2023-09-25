import { expect } from 'chai';
import { describe, it } from 'node:test';

import { defaultContext, DisputeContext } from '../src/bot/context';
import { ERROR_TREE_NEGATIVE_DIFF } from '../src/bot/errors';
import runBot, { checkDisputeOpportunity } from '../src/bot/run';

type ProblematicBlock = {
  blockNumber: number;
  errorCode: number;
};

describe('Known cases of past disputes', async function () {
  it('Should output same errors cases from Polygon history', async function () {
    const polygonProblematicBlocks: ProblematicBlock[] = [
      { blockNumber: 47471300, errorCode: ERROR_TREE_NEGATIVE_DIFF },
      { blockNumber: 47456455, errorCode: ERROR_TREE_NEGATIVE_DIFF },
    ];

    await Promise.all(
      polygonProblematicBlocks.map(async (block) => {
        const testContext: DisputeContext = defaultContext(137, block.blockNumber);
        testContext.logger = undefined;
        const { error, code } = await checkDisputeOpportunity(testContext);

        expect(error).to.equal(true);
        expect(code).to.equal(block.errorCode);
      })
    );
  });

  it('Should output same errors cases from Ethereum history', async function () {
    const ethereumProblematicBlocks: ProblematicBlock[] = [{ blockNumber: 17812800, errorCode: ERROR_TREE_NEGATIVE_DIFF }];

    await Promise.all(
      ethereumProblematicBlocks.map(async (block) => {
        const testContext: DisputeContext = defaultContext(1, block.blockNumber);
        testContext.logger = undefined;
        const { error, code } = await checkDisputeOpportunity(testContext);

        expect(error).to.equal(true);
        expect(code).to.equal(block.errorCode);
      })
    );
  });
});
