import 'dotenv/config';

import express, { Application, Response } from 'express';

import disputeBot from './routes/dispute-bot';

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

// =================================== ROUTES ==================================

app.get('/', (_req, res: Response) => {
  console.log(`Listening on port ${PORT}`);
  res.send(`Server is running on port: ${PORT}`);
});

app.use('/dispute', disputeBot);

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
