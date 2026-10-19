import express from 'express';
import { db } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { canTouch, scopeUserId } from '../lib/auth.js';
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
});

export const sipsRouter = express.Router();

/** Monthly plans with whether this month's instalment has been logged yet. */
sipsRouter.get('/status', (req, res) => {
  const uid = scopeUserId(req);
  const now = nowParts();
  const ym = `${now.year}-${pad(now.month)}`;
  const { from, to } = monthRange(ym);
  const sips = db
    .prepare(
      `SELECT s.*, u.name AS user_name FROM sips s JOIN users u ON u.id = s.user_id
       ${uid !== null ? 'WHERE s.user_id = ?' : ''} ORDER BY s.active DESC, s.day_of_month`
    )
    .all(...(uid !== null ? [uid] : []));
  const logged = db.prepare('SELECT id, amount, date FROM investments WHERE sip_id = ? AND date BETWEEN ? AND ?');
  res.json(
    sips.map((s) => {
      const entry = logged.get(s.id, from, to);
      return { ...s, month: ym, due_date: clampedDate(now.year, now.month, s.day_of_month), logged_this_month: entry || null };
    })
  );
});

/** Records this month's instalment for a plan as an investment entry. */
sipsRouter.post('/:id/log', (req, res) => {
  const sip = db.prepare('SELECT * FROM sips WHERE id = ?').get(req.params.id);
  if (!canTouch(req, sip)) return res.status(404).json({ error: 'Not found' });
  const now = nowParts();
  const date = req.body?.date || clampedDate(now.year, now.month, Math.min(sip.day_of_month, now.day));
  const amount = Number(req.body?.amount) || sip.amount;
  const info = db
    .prepare('INSERT INTO investments (user_id, sip_id, date, name, type, amount, platform) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sip.user_id, sip.id, date, sip.name, sip.type, amount, sip.platform);
  res.status(201).json(db.prepare('SELECT * FROM investments WHERE id = ?').get(info.lastInsertRowid));
});

sipsRouter.use('/', sipCrud);
