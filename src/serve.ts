import 'dotenv/config';

import { ChainId } from '@angleprotocol/sdk';
import express, { Application } from 'express';

import { defaultContext, DisputeContext } from './bot/context';
import run from './bot/runner';
import NETWORKS from './helpers/networks';
import { getChainId } from './utils';

export default function () {
  const app: Application = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const PORT = process.env.PORT || 5002;

  app.get('/:chain?/:blockNumber?', async (req, res) => {
    const { chain, blockNumber } = req.params;
    const chainProvided = !!(chain && NETWORKS[chain]);
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
