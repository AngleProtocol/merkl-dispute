import { ChainId, NETWORK_LABELS } from '@angleprotocol/sdk';
import { expect } from 'chai';
import { describe, it } from 'node:test';

import { defaultContext, DisputeContext } from '../src/bot/context';
import run, { runSteps } from '../src/bot/runner';
import { BotError } from '../src/types/bot';

type ProblematicBlock = {
  chainId: number;
  blockNumber: number;
  errorCode?: number;
};

const tryAtBlock = async ({ chainId, blockNumber, errorCode }: ProblematicBlock) => {
  const testContext: DisputeContext = defaultContext(chainId, blockNumber);
  testContext.logger = undefined;
  const result = await runSteps(testContext);
  const testForError = !!errorCode;

  console.log(`reason on ${NETWORK_LABELS[chainId]} at block ${blockNumber}:`, result.res.reason);

  expect(result.err).to.equal(testForError);
  testForError && result.err && expect(result.res.code).to.equal(errorCode);
};

describe('Known cases of past disputes', async function () {
  it('Should output same errors cases from Merkl history', async function () {
    const problematicBlocks: ProblematicBlock[] = [
      { chainId: ChainId.MAINNET, blockNumber: 17812800, errorCode: BotError.NegativeDiff },
      { chainId: ChainId.MAINNET, blockNumber: 18013500, errorCode: BotError.AlreadyClaimed }, // Aug 28 - Start of already claimed problem
      { chainId: ChainId.MAINNET, blockNumber: 18052100, errorCode: BotError.AlreadyClaimed }, // Sep 2 - Still spreading incorrect claims...
      { chainId: ChainId.MAINNET, blockNumber: 18059300, errorCode: undefined }, // Sep 4 - Rewards spread enough to cover anomaly
    ];

    await Promise.all(problematicBlocks.map(tryAtBlock));
  });
});
