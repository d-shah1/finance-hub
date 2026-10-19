import { db } from '../db.js';
import { crudRouter, ValidationError } from '../lib/crud.js';
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '../lib/constants.js';

export default crudRouter({
  table: 'expenses',
  dateColumn: 'date',
  orderBy: 't.date DESC, t.id DESC',
  fields: {
    date: { type: 'date', required: true, label: 'Date' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    category: { type: 'string', required: true, label: 'Category' },
    payment_mode: { type: 'string', required: true, enum: PAYMENT_MODES, label: 'Payment mode' },
    card_id: { type: 'int' },
    upi_app: { type: 'string', maxLength: 40 },
    merchant: { type: 'string', maxLength: 120 },
    description: { type: 'string', maxLength: 300 },
    tags: { type: 'string', maxLength: 200 },
    is_need: { type: 'bool', default: 1 },
    notes: { type: 'string', maxLength: 1000 },
  },
  filters(req) {
    const clauses = [];
    const params = [];
    const { category, payment_mode, card_id, q } = req.query;
    if (category) { clauses.push('t.category = ?'); params.push(category); }
    if (payment_mode) { clauses.push('t.payment_mode = ?'); params.push(payment_mode); }
    if (card_id) { clauses.push('t.card_id = ?'); params.push(Number(card_id)); }
    if (q) {
      clauses.push("(t.merchant LIKE ? OR t.description LIKE ? OR t.tags LIKE ? OR t.notes LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    return { clauses, params };
  },
  beforeSave(row, req, existing) {
    if (row.category !== undefined && !EXPENSE_CATEGORIES.includes(row.category)) {
      // Custom categories are allowed but kept tidy.
      row.category = row.category.slice(0, 40);
    }
    const mode = row.payment_mode ?? existing?.payment_mode;
    if (mode !== 'Card') row.card_id = null;
    if (mode !== 'UPI') row.upi_app = null;
    const cardId = row.card_id ?? (mode === 'Card' ? existing?.card_id : null);
    if (mode === 'Card' && cardId) {
      const ownerId = existing?.user_id ?? row.user_id;
      const card = db.prepare('SELECT user_id FROM cards WHERE id = ?').get(cardId);
      if (!card || card.user_id !== ownerId) throw new ValidationError('That card does not belong to this account');
    }
  },
});
