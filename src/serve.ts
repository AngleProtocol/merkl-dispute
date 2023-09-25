import 'dotenv/config';

import { ChainId, registry } from '@angleprotocol/sdk';
import express, { Application } from 'express';

import { defaultContext, DisputeContext } from './bot/context';
import run from './bot/run';
import ConsoleLogger from './helpers/logger/ConsoleLogger';
import NETWORKS from './helpers/networks';
import GithubRootsProvider from './providers/merkl-roots/GithubRootsProvider';
import RpcProvider from './providers/on-chain/RpcProvider';
import { getChainId } from './utils';

export default function () {
  const app: Application = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const PORT = process.env.PORT || 5002;

  // =================================== ROUTES ==================================

  app.get('/:chain?/:blockNumber?', async (req, res) => {
    const { chain, blockNumber } = req.params;
    const chainProvided: boolean = !!(chain && NETWORKS[chain]);
    const blockProvided: boolean = blockNumber && blockNumber !== '';

    console.log('chain', chain, chainProvided, NETWORKS[chain], 'block', blockProvided);

    const chainId: ChainId = chainProvided ? (parseInt(chain) as ChainId) : getChainId();
    const context: DisputeContext = defaultContext(chainId, blockProvided ? parseInt(blockNumber) : undefined);

    try {
      await run(context);
    } catch (err) {
      return res.status(500);
    }

    return res.status(200);
  });

  app.listen(PORT, () => {
    console.log(`Dispute bot listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
  });
}
