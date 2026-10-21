import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { init } from './db.js';
import { ah, requireAuth } from './lib/auth.js';
import { EXPENSE_CATEGORIES, INCOME_TYPES, INVESTMENT_TYPES, PAYMENT_MODES, UPI_APPS, ACCOUNT_TYPES } from './lib/constants.js';
import usersRouter from './routes/users.js';
import expensesRouter from './routes/expenses.js';
import incomeRouter from './routes/income.js';
import holdingsRouter from './routes/holdings.js';
import insightsRouter from './routes/insights.js';
import pushRouter from './routes/push.js';
import { investmentsRouter, sipsRouter } from './routes/investments.js';
import { cardPaymentsRouter, cardsRouter } from './routes/cards.js';
import accountsRouter from './routes/accounts.js';
import { tick } from './lib/scheduler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // Tables and starter accounts are created on the first request of each (cold-started) instance.
  app.use('/api', ah(async (req, res, next) => {
    await init();
    next();
  }));

  // Reminder jobs for serverless hosting. Vercel Cron calls /api/cron/evening and /api/cron/morning once a
  // day each (it sends "Authorization: Bearer CRON_SECRET"). Plain /api/cron runs the time-based check,
  // for an external scheduler (e.g. cron-job.org with ?key=CRON_SECRET) that calls it every few minutes.
  app.all(['/api/cron', '/api/cron/:job(evening|morning)'], ah(async (req, res) => {
    const given = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.query.key;
    if (!config.cronSecret || given !== config.cronSecret) return res.status(401).json({ error: 'Bad cron secret' });
    await tick(new Date(), { job: req.params.job });
    res.json({ ok: true, job: req.params.job || 'scheduled', at: new Date().toISOString() });
  }));

  app.use('/api', usersRouter);
  app.use('/api', requireAuth);
  app.get('/api/meta', (req, res) =>
    res.json({ categories: EXPENSE_CATEGORIES, paymentModes: PAYMENT_MODES, upiApps: UPI_APPS, incomeTypes: INCOME_TYPES, investmentTypes: INVESTMENT_TYPES, accountTypes: ACCOUNT_TYPES, timezone: config.timezone, fixedReminderTimes: config.onVercel })
  );
  app.use('/api/expenses', expensesRouter);
  app.use('/api/income', incomeRouter);
  app.use('/api/investments', investmentsRouter);
  app.use('/api/sips', sipsRouter);
  app.use('/api/holdings', holdingsRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/cards', cardsRouter);
  app.use('/api/card-payments', cardPaymentsRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // On Vercel the static site is served by the CDN; locally Express serves the built client.
  const dist = path.join(config.root, 'client', 'dist');
  if (!config.onVercel && fs.existsSync(dist)) {
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
