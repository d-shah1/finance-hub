import express from 'express';
import { db } from '../db.js';
import { crudRouter, parseBody, ValidationError } from '../lib/crud.js';
import { ah, canTouch, scopeUserId } from '../lib/auth.js';
import { checkBankAccount } from '../lib/accounts.js';
import { COMPOUNDING, PAYOUTS, fdFigures, maturityAmount, maturityDate } from '../lib/fd.js';
import { diffDays, today } from '../lib/dates.js';

const fields = {
  bank: { type: 'string', required: true, maxLength: 80, label: 'Bank' },
  name: { type: 'string', maxLength: 80 },
  fd_number: { type: 'string', maxLength: 30 },
  principal: { type: 'number', required: true, min: 1, label: 'Amount' },
  rate: { type: 'number', required: true, min: 0, max: 20, label: 'Interest rate' },
  start_date: { type: 'date', required: true, label: 'Start date' },
  tenure_months: { type: 'int', min: 0, max: 240, default: 12, label: 'Tenure (months)' },
  tenure_days: { type: 'int', min: 0, max: 365, default: 0, label: 'Tenure (days)' },
  compounding: { type: 'string', enum: Object.keys(COMPOUNDING), default: 'quarterly', label: 'Compounding' },
  payout: { type: 'string', enum: PAYOUTS, default: 'cumulative', label: 'Interest payout' },
  bank_account_id: { type: 'int' },
  auto_renew: { type: 'bool', default: 0 },
  notes: { type: 'string', maxLength: 500 },
};

const crud = crudRouter({
  table: 'fixed_deposits',
  orderBy: 't.closed_on IS NOT NULL, t.maturity_date ASC',
  fields,
  async beforeSave(row, req, existing) {
    await checkBankAccount(row.bank_account_id, existing?.user_id ?? row.user_id);
    const start = row.start_date ?? existing.start_date;
    const months = row.tenure_months ?? existing?.tenure_months ?? 12;
    const days = row.tenure_days ?? existing?.tenure_days ?? 0;
    const maturity = maturityDate(start, months, days);
    if (diffDays(start, maturity) < 7) throw new ValidationError('An FD must run for at least 7 days');
    row.maturity_date = maturity;
  },
});

export function withFigures(fd, todayIso = today()) {
  return { ...fd, ...fdFigures(fd, todayIso) };
}

const router = express.Router();

router.get('/overview', ah(async (req, res) => {
  const uid = scopeUserId(req);
  const rows = await db.all(
    `SELECT f.*, u.name AS user_name FROM fixed_deposits f JOIN users u ON u.id = f.user_id
     ${uid !== null ? 'WHERE f.user_id = ?' : ''} ORDER BY f.closed_on IS NOT NULL, f.maturity_date`,
    ...(uid !== null ? [uid] : [])
  );
  res.json(rows.map((r) => withFigures(r)));
}));

/** Re-invests a matured (or maturing) FD: closes it and opens a new one with the maturity amount. */
export async function renewFd(fd, opts = {}) {
  const amount = fd.payout === 'cumulative' ? maturityAmount(fd) : fd.principal;
  const months = opts.tenure_months ?? fd.tenure_months;
  const days = opts.tenure_days ?? fd.tenure_days;
  const rate = opts.rate ?? fd.rate;
  await db.run("UPDATE fixed_deposits SET closed_on = ?, close_type = 'renewed', close_amount = ? WHERE id = ?", fd.maturity_date, amount, fd.id);
  const { lastInsertRowid } = await db.run(
    `INSERT INTO fixed_deposits (user_id, bank, name, fd_number, principal, rate, start_date, tenure_months, tenure_days, maturity_date,
       compounding, payout, bank_account_id, auto_renew, renewed_from, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fd.user_id, fd.bank, fd.name, fd.fd_number, Math.round(amount * 100) / 100, rate, fd.maturity_date, months, days,
    maturityDate(fd.maturity_date, months, days), fd.compounding, fd.payout, fd.bank_account_id, fd.auto_renew, fd.id, fd.notes
  );
  return db.get('SELECT * FROM fixed_deposits WHERE id = ?', lastInsertRowid);
}

router.post('/:id/renew', ah(async (req, res) => {
  const fd = await db.get('SELECT * FROM fixed_deposits WHERE id = ?', req.params.id);
  if (!canTouch(req, fd)) return res.status(404).json({ error: 'Not found' });
  if (fd.closed_on) throw new ValidationError('This FD is already closed');
  const opts = parseBody(req.body, { rate: fields.rate, tenure_months: fields.tenure_months, tenure_days: fields.tenure_days }, { partial: true });
  res.status(201).json(withFigures(await renewFd(fd, opts)));
}));

/** Breaks an FD before maturity (or records the actual amount received). */
router.post('/:id/close', ah(async (req, res) => {
  const fd = await db.get('SELECT * FROM fixed_deposits WHERE id = ?', req.params.id);
  if (!canTouch(req, fd)) return res.status(404).json({ error: 'Not found' });
  if (fd.closed_on) throw new ValidationError('This FD is already closed');
  const body = parseBody(req.body, { closed_on: { type: 'date', label: 'Closed on' }, close_amount: { type: 'number', min: 0, label: 'Amount received' } }, { partial: true });
  const on = body.closed_on || today();
  if (on < fd.start_date) throw new ValidationError('Closed on must be after the start date');
  const amount = body.close_amount ?? fdFigures({ ...fd, closed_on: on }, on).value_today;
  await db.run("UPDATE fixed_deposits SET closed_on = ?, close_type = 'withdrawn', close_amount = ? WHERE id = ?", on, amount, fd.id);
  res.json(withFigures(await db.get('SELECT * FROM fixed_deposits WHERE id = ?', fd.id)));
}));

/** Undo a close or renewal (removes the renewed FD it created). */
router.post('/:id/reopen', ah(async (req, res) => {
  const fd = await db.get('SELECT * FROM fixed_deposits WHERE id = ?', req.params.id);
  if (!canTouch(req, fd)) return res.status(404).json({ error: 'Not found' });
  if (fd.close_type === 'renewed') await db.run('DELETE FROM fixed_deposits WHERE renewed_from = ?', fd.id);
  await db.run('UPDATE fixed_deposits SET closed_on = NULL, close_type = NULL, close_amount = NULL WHERE id = ?', fd.id);
  res.json(withFigures(await db.get('SELECT * FROM fixed_deposits WHERE id = ?', fd.id)));
}));

router.use('/', crud);

export default router;
