import express from 'express';
import { db } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { scopeUserId } from '../lib/auth.js';
import { cardCycle } from '../lib/cards.js';
import { today } from '../lib/dates.js';

export const cardPaymentsRouter = crudRouter({
  table: 'card_payments',
  dateColumn: 'paid_on',
  orderBy: 't.paid_on DESC, t.id DESC',
  fields: {
    card_id: { type: 'int', required: true, label: 'Card' },
    due_date: { type: 'date', required: true, label: 'Due date' },
    amount: { type: 'number', required: true, min: 0, label: 'Amount' },
    paid_on: { type: 'date', required: true, label: 'Paid on' },
    notes: { type: 'string', maxLength: 500 },
  },
  beforeSave(row, req, existing) {
    if (row.card_id !== undefined) {
      const card = db.prepare('SELECT user_id FROM cards WHERE id = ?').get(row.card_id);
      const ownerId = existing?.user_id ?? row.user_id;
      if (!card || card.user_id !== ownerId) {
        const err = new Error('Card not found');
        err.status = 400;
        throw err;
      }
      // Payments always belong to the card's owner, even when an admin records them.
      if (!existing) row.user_id = card.user_id;
    }
  },
});

const cardCrud = crudRouter({
  table: 'cards',
  orderBy: 't.active DESC, t.name ASC',
  fields: {
    name: { type: 'string', required: true, maxLength: 80, label: 'Card name' },
    bank: { type: 'string', maxLength: 80 },
    last4: { type: 'string', maxLength: 4 },
    credit_limit: { type: 'number', min: 0 },
    statement_day: { type: 'int', required: true, min: 1, max: 31, label: 'Statement day' },
    due_day: { type: 'int', required: true, min: 1, max: 31, label: 'Due day' },
    color: { type: 'string', maxLength: 9, default: '#2a78d6' },
    active: { type: 'bool', default: 1 },
    notes: { type: 'string', maxLength: 500 },
  },
});

/** Builds the bill/due summary for each card. Shared with the reminder scheduler. */
export function cardsOverview(uid, todayIso = today()) {
  const cards = db
    .prepare(
      `SELECT c.*, u.name AS user_name, u.card_reminder_days FROM cards c JOIN users u ON u.id = c.user_id
       WHERE c.active = 1 ${uid !== null ? 'AND c.user_id = ?' : ''} ORDER BY c.name`
    )
    .all(...(uid !== null ? [uid] : []));
  const spend = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE card_id = ? AND date BETWEEN ? AND ?');
  const payment = db.prepare('SELECT * FROM card_payments WHERE card_id = ? AND due_date = ? ORDER BY id DESC');
  return cards.map((card) => {
    const cycle = cardCycle(card, todayIso);
    const billed = spend.get(card.id, cycle.billed_from, cycle.billed_to).total;
    const unbilled = spend.get(card.id, cycle.unbilled_from, todayIso).total;
    const payments = payment.all(card.id, cycle.due_date);
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const paid = payments.length > 0;
    let status = 'upcoming';
    if (paid) status = 'paid';
    else if (cycle.days_to_due < 0) status = 'overdue';
    else if (cycle.days_to_due <= (card.card_reminder_days ?? 3)) status = 'due-soon';
    const outstanding = billed + unbilled - paidAmount;
    return {
      ...card,
      cycle,
      billed_amount: billed,
      unbilled_amount: unbilled,
      paid_amount: paidAmount,
      payments,
      status,
      utilisation: card.credit_limit ? Math.max(0, outstanding) / card.credit_limit : null,
    };
  });
}

export const cardsRouter = express.Router();
cardsRouter.get('/overview', (req, res) => res.json(cardsOverview(scopeUserId(req))));
cardsRouter.use('/', cardCrud);
