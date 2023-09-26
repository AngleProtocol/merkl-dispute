import { expect } from 'chai';
import { describe, it } from 'node:test';

import { defaultContext, DisputeContext } from '../src/bot/context';
import { DisputeError } from '../src/bot/errors';
import { checkDisputeOpportunity } from '../src/bot/run';

type ProblematicBlock = {
  chainId: number;
  blockNumber: number;
  errorCode: number;
};

const tryAtBlock = async (block: ProblematicBlock) => {
  const testContext: DisputeContext = defaultContext(block.chainId, block.blockNumber);
  testContext.logger = undefined;
  const { error, code, reason } = await checkDisputeOpportunity(testContext);

  console.log(`reason on ${block.chainId} at ${block.blockNumber}`, reason);
  expect(error).to.equal(true);
  expect(code).to.equal(block.errorCode);
};

describe('Known cases of past disputes', async function () {
  it('Should output same errors cases from Merkl history', async function () {
    const problematicBlocks: ProblematicBlock[] = [
      { chainId: 137, blockNumber: 47471300, errorCode: DisputeError.NegativeDiff },
      { chainId: 1, blockNumber: 17812800, errorCode: DisputeError.NegativeDiff },
    ];

    await Promise.all(problematicBlocks.map(tryAtBlock));
  });
});
