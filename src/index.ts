import 'dotenv/config';

import express, { Application } from 'express';

import index from './routes';

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5002;

// =================================== ROUTES ==================================

app.use('/', index);

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
