import 'dotenv/config';

import express from 'express';

import routes from './routes';

const app = express();

// ================================ MIDDLEWARES ================================

if (process.env.ENV !== 'local' && !!process.env.HEADER_KEY && !!process.env.HEADER_VALUE) {
  app.get('/', (req, res, next) => {
    if (req.get(process.env.HEADER_KEY as string) === process.env.HEADER_VALUE) {
      next();
    } else {
      res.status(403).send('Request refused');
    }
  });
}

// =================================== ROUTES ==================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});

routes(app);
