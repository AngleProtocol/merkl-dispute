import { Express } from 'express';

import disputeBot from './dispute-bot';

export default function (app: Express) {
  /** trigger Merkl dispute bot */
  app.use('/', disputeBot);
}
