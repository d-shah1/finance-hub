import express from 'express';
import { db } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { ah, canTouch, scopeUserId } from '../lib/auth.js';
import { INVESTMENT_TYPES } from '../lib/constants.js';
import { clampedDate, monthRange, nowParts, pad } from '../lib/dates.js';

export const investmentsRouter = crudRouter({
  table: 'investments',
  dateColumn: 'date',
  orderBy: 't.date DESC, t.id DESC',
  fields: {
    date: { type: 'date', required: true, label: 'Date' },
    name: { type: 'string', required: true, maxLength: 120, label: 'Name' },
    type: { type: 'string', enum: INVESTMENT_TYPES, default: 'Mutual Fund', label: 'Type' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    platform: { type: 'string', maxLength: 60 },
    sip_id: { type: 'int' },
    notes: { type: 'string', maxLength: 1000 },
  },
});

const sipCrud = crudRouter({
  table: 'sips',
  orderBy: 't.active DESC, t.day_of_month ASC',
  fields: {
    name: { type: 'string', required: true, maxLength: 120, label: 'Name' },
    type: { type: 'string', enum: INVESTMENT_TYPES, default: 'Mutual Fund', label: 'Type' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    day_of_month: { type: 'int', min: 1, max: 31, default: 5, label: 'Day of month' },
    platform: { type: 'string', maxLength: 60 },
    start_date: { type: 'date' },
    active: { type: 'bool', default: 1 },
    notes: { type: 'string', maxLength: 1000 },
  },
  onDelete: (sip) => db.run('UPDATE investments SET sip_id = NULL WHERE sip_id = ?', sip.id),
});

export const sipsRouter = express.Router();

/** Monthly plans with whether this month's instalment has been logged yet. */
sipsRouter.get('/status', ah(async (req, res) => {
  const uid = scopeUserId(req);
  const now = nowParts();
  const ym = `${now.year}-${pad(now.month)}`;
  const { from, to } = monthRange(ym);
  const sips = await db.all(
    `SELECT s.*, u.name AS user_name FROM sips s JOIN users u ON u.id = s.user_id
     ${uid !== null ? 'WHERE s.user_id = ?' : ''} ORDER BY s.active DESC, s.day_of_month`,
    ...(uid !== null ? [uid] : [])
  );
  const out = [];
  for (const s of sips) {
    const entry = await db.get('SELECT id, amount, date FROM investments WHERE sip_id = ? AND date BETWEEN ? AND ?', s.id, from, to);
    out.push({ ...s, month: ym, due_date: clampedDate(now.year, now.month, s.day_of_month), logged_this_month: entry || null });
  }
  res.json(out);
}));

/** Records this month's instalment for a plan as an investment entry. */
sipsRouter.post('/:id/log', ah(async (req, res) => {
  const sip = await db.get('SELECT * FROM sips WHERE id = ?', req.params.id);
  if (!canTouch(req, sip)) return res.status(404).json({ error: 'Not found' });
  const now = nowParts();
  const date = req.body?.date || clampedDate(now.year, now.month, Math.min(sip.day_of_month, now.day));
  const amount = Number(req.body?.amount) || sip.amount;
  const info = await db.run(
    'INSERT INTO investments (user_id, sip_id, date, name, type, amount, platform) VALUES (?, ?, ?, ?, ?, ?, ?)',
    sip.user_id, sip.id, date, sip.name, sip.type, amount, sip.platform
  );
  res.status(201).json(await db.get('SELECT * FROM investments WHERE id = ?', info.lastInsertRowid));
}));

sipsRouter.use('/', sipCrud);
