import express from 'express';
import { db } from '../db.js';
import { crudRouter, ValidationError } from '../lib/crud.js';
import { ah, canTouch, scopeUserId } from '../lib/auth.js';
import { INVESTMENT_TYPES } from '../lib/constants.js';
import { clampedDate, monthRange, nowParts, pad, today } from '../lib/dates.js';
import { checkBankAccount } from '../lib/accounts.js';
import { fillAllPlans, fillPlan, planStart, skipMonth, skipPausedMonths, trimPlan } from '../lib/sips.js';
import { clearPlanUnits, planValues, valuePlan } from '../lib/mf.js';

const checkAccount = (row, req, existing) => checkBankAccount(row.bank_account_id, existing?.user_id ?? row.user_id);

/** Lists always include SIP instalments that have come due since the last visit. */
const fillFirst = ah(async (req, res, next) => {
  if (req.method === 'GET') await fillAllPlans(scopeUserId(req));
  next();
});

const investmentsCrud = crudRouter({
  table: 'investments',
  dateColumn: 'date',
  orderBy: 't.date DESC, t.id DESC',
  filters: (req) => (req.query.sip_id ? { clauses: ['t.sip_id = ?'], params: [Number(req.query.sip_id)] } : { clauses: [], params: [] }),
  fields: {
    date: { type: 'date', required: true, label: 'Date' },
    name: { type: 'string', required: true, maxLength: 120, label: 'Name' },
    type: { type: 'string', enum: INVESTMENT_TYPES, default: 'Mutual Fund', label: 'Type' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    platform: { type: 'string', maxLength: 60 },
    sip_id: { type: 'int' },
    bank_account_id: { type: 'int' },
    notes: { type: 'string', maxLength: 1000 },
  },
  async beforeSave(row, req, existing) {
    await checkAccount(row, req, existing);
    // An instalment you edit is yours now; its plan will not change or remove it.
    if (existing?.auto) row.auto = 0;
    // New amount or date: the units bought change too; they are recalculated on the next valuation.
    if (existing && ((row.amount !== undefined && row.amount !== existing.amount) || (row.date !== undefined && row.date !== existing.date))) {
      row.nav = null;
      row.units = null;
    }
  },
  // Re-value an edited instalment of a fund-linked plan right away (history is cached).
  async afterSave(inv) {
    if (!inv.sip_id || inv.units != null) return;
    const sip = await db.get('SELECT * FROM sips WHERE id = ?', inv.sip_id);
    if (sip?.scheme_code) await valuePlan(sip).catch((e) => console.warn('[mf]', sip.name, e.message));
  },
  // Deleting a plan's instalment means that month was skipped; don't fill it in again.
  onDelete: (inv) => inv.sip_id && skipMonth(inv.sip_id, inv.date),
});

export const investmentsRouter = express.Router();
investmentsRouter.use(fillFirst, investmentsCrud);

const sipCrud = crudRouter({
  table: 'sips',
  orderBy: 't.active DESC, t.day_of_month ASC',
  fields: {
    name: { type: 'string', required: true, maxLength: 120, label: 'Name' },
    type: { type: 'string', enum: INVESTMENT_TYPES, default: 'Mutual Fund', label: 'Type' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    day_of_month: { type: 'int', min: 1, max: 31, default: 5, label: 'Day of month' },
    platform: { type: 'string', maxLength: 60 },
    start_date: { type: 'date', label: 'Start date' },
    end_date: { type: 'date', label: 'Stopped on' },
    active: { type: 'bool', default: 1 },
    bank_account_id: { type: 'int' },
    scheme_code: { type: 'string', maxLength: 20 },
    scheme_name: { type: 'string', maxLength: 200 },
    notes: { type: 'string', maxLength: 1000 },
  },
  async beforeSave(row, req, existing) {
    await checkAccount(row, req, existing);
    if (!existing && !row.start_date) row.start_date = today();
    const start = row.start_date ?? existing?.start_date;
    const end = row.end_date !== undefined ? row.end_date : existing?.end_date;
    if (start && end && end < start) throw new ValidationError('Stopped on must be after the start date');
    const active = row.active ?? existing?.active ?? 1;
    if (existing && existing.active && !active && !end) {
      row.end_date = today(); // pausing: stop filling in from today
    } else if (existing && !existing.active && active && row.end_date === undefined) {
      // resuming: leave the paused months empty, then carry on
      await skipPausedMonths(existing);
      row.end_date = null;
    } else if (!existing && row.end_date) {
      row.active = 0; // a plan entered with a stop date is already finished
    }
  },
  // Bring the plan's instalments in line with its (possibly new) dates and amount going forward.
  async afterSave(sip, req, existing) {
    await trimPlan(sip);
    await fillPlan(sip);
    if (existing && existing.scheme_code !== sip.scheme_code) await clearPlanUnits(sip.id);
    if (sip.scheme_code) {
      // Value straight away so the plan shows its worth; if the fund service is down, the morning job retries.
      await valuePlan(sip).catch((e) => console.warn('[mf]', sip.name, e.message));
    }
  },
  // Removing a plan removes the instalments it filled in; ones you logged or edited yourself stay.
  async onDelete(sip) {
    await db.run('DELETE FROM investments WHERE sip_id = ? AND auto = 1', sip.id);
    await db.run('UPDATE investments SET sip_id = NULL WHERE sip_id = ?', sip.id);
    await db.run('DELETE FROM sip_skips WHERE sip_id = ?', sip.id);
  },
});

export const sipsRouter = express.Router();

/** Monthly plans with this month's status and their totals so far. */
sipsRouter.get('/status', ah(async (req, res) => {
  const uid = scopeUserId(req);
  await fillAllPlans(uid);
  const now = nowParts();
  const ym = `${now.year}-${pad(now.month)}`;
  const { from, to } = monthRange(ym);
  const sips = await db.all(
    `SELECT s.*, u.name AS user_name,
            (SELECT COUNT(*) FROM investments i WHERE i.sip_id = s.id) AS instalments,
            (SELECT COALESCE(SUM(amount), 0) FROM investments i WHERE i.sip_id = s.id) AS invested,
            (SELECT MIN(date) FROM investments i WHERE i.sip_id = s.id) AS first_date
     FROM sips s JOIN users u ON u.id = s.user_id
     ${uid !== null ? 'WHERE s.user_id = ?' : ''} ORDER BY s.active DESC, s.day_of_month`,
    ...(uid !== null ? [uid] : [])
  );
  const values = await planValues(uid);
  const out = [];
  for (const s of sips) {
    const entry = await db.get('SELECT id, amount, date FROM investments WHERE sip_id = ? AND date BETWEEN ? AND ?', s.id, from, to);
    out.push({
      ...s,
      valuation: values[s.id] || null,
      start: planStart(s),
      month: ym,
      due_date: clampedDate(now.year, now.month, s.day_of_month),
      logged_this_month: entry || null,
    });
  }
  res.json(out);
}));

/** Records this month's instalment now, before its debit day (it is otherwise filled in on the day). */
sipsRouter.post('/:id/log', ah(async (req, res) => {
  const sip = await db.get('SELECT * FROM sips WHERE id = ?', req.params.id);
  if (!canTouch(req, sip)) return res.status(404).json({ error: 'Not found' });
  const now = nowParts();
  const date = req.body?.date || clampedDate(now.year, now.month, Math.min(sip.day_of_month, now.day));
  const amount = Number(req.body?.amount) || sip.amount;
  const info = await db.run(
    'INSERT INTO investments (user_id, sip_id, date, name, type, amount, platform, bank_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    sip.user_id, sip.id, date, sip.name, sip.type, amount, sip.platform, sip.bank_account_id ?? null
  );
  res.status(201).json(await db.get('SELECT * FROM investments WHERE id = ?', info.lastInsertRowid));
}));

sipsRouter.use('/', sipCrud);
