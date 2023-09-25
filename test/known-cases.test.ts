import { describe, it } from 'node:test';
import runBot, { DisputeContext } from '../src/bot/run';

describe('Known cases of past disputes', function () {
  it('Should dispute for negative diffs', async function () {
    const polygonProblematicBlocks = [47456775, 47471300];
    const ethereumProblematicBlocks = [17813132];
    const testContext: DisputeContext = {};
    runBot();
  });
});
