import { expect } from 'chai';
import { describe, it } from 'node:test';

import { defaultContext, DisputeContext } from '../src/bot/context';
import { DisputeError } from '../src/bot/errors';
import { checkDisputeOpportunity } from '../src/bot/run';

type ProblematicBlock = {
  chainId: number;
  blockNumber: number;
  errorCode?: number;
};

const tryAtBlock = async ({chainId, blockNumber, errorCode}: ProblematicBlock) => {
  const testContext: DisputeContext = defaultContext(chainId, blockNumber);
  testContext.logger = undefined;
  const { error, code, reason } = await checkDisputeOpportunity(testContext);
  const testForError = !!errorCode;

  console.log(`reason on ${chainId} at ${blockNumber}`, reason);

  expect(error).to.equal(testForError);
  testForError && expect(code).to.equal(errorCode);
};

describe('Known cases of past disputes', async function () {
  it('Should output same errors cases from Merkl history', async function () {
    const problematicBlocks: ProblematicBlock[] = [
      { chainId: 1, blockNumber: 17812800, errorCode: DisputeError.NegativeDiff },
      { chainId: 1, blockNumber: 18013500, errorCode: DisputeError.AlreadyClaimed },
      { chainId: 1, blockNumber: 18052100, errorCode: DisputeError.AlreadyClaimed },
      { chainId: 1, blockNumber: 18059300, errorCode: undefined },
    ];

    await Promise.all(problematicBlocks.map(tryAtBlock));
  });
});
