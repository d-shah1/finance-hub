import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { seedUsers } from './db.js';
import { requireAuth } from './lib/auth.js';
import { EXPENSE_CATEGORIES, INCOME_TYPES, INVESTMENT_TYPES, PAYMENT_MODES, UPI_APPS } from './lib/constants.js';
import usersRouter from './routes/users.js';
import expensesRouter from './routes/expenses.js';
import incomeRouter from './routes/income.js';
import holdingsRouter from './routes/holdings.js';
import insightsRouter from './routes/insights.js';
import pushRouter from './routes/push.js';
import { investmentsRouter, sipsRouter } from './routes/investments.js';
import { cardPaymentsRouter, cardsRouter } from './routes/cards.js';
import { startScheduler } from './lib/scheduler.js';
import { activeProvider } from './lib/llm.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', usersRouter);
  app.use('/api', requireAuth);
  app.get('/api/meta', (req, res) =>
    res.json({ categories: EXPENSE_CATEGORIES, paymentModes: PAYMENT_MODES, upiApps: UPI_APPS, incomeTypes: INCOME_TYPES, investmentTypes: INVESTMENT_TYPES, timezone: config.timezone })
  );
  app.use('/api/expenses', expensesRouter);
  app.use('/api/income', incomeRouter);
  app.use('/api/investments', investmentsRouter);
  app.use('/api/sips', sipsRouter);
  app.use('/api/holdings', holdingsRouter);
  app.use('/api/cards', cardsRouter);
  app.use('/api/card-payments', cardPaymentsRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  const dist = path.join(config.root, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const created = seedUsers();
  if (created.length) {
    console.log('Created starter accounts (change these passwords in Settings):');
    for (const u of created) console.log(`  ${u.username.padEnd(8)} / ${u.password}  (${u.role})`);
  }
  createApp().listen(config.port, () => {
    console.log(`Finance Hub running on http://localhost:${config.port}  ·  timezone ${config.timezone}  ·  AI: ${activeProvider() || 'built-in advisor (no API key set)'}`);
  });
  startScheduler();
}
