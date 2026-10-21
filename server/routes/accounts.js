import express from 'express';
import { db } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { ah, scopeUserId } from '../lib/auth.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';
import { accountsOverview, stampBalance } from '../lib/accounts.js';

const crud = crudRouter({
  table: 'bank_accounts',
  orderBy: 't.active DESC, t.name ASC',
  fields: {
    name: { type: 'string', required: true, maxLength: 80, label: 'Account name' },
    bank: { type: 'string', maxLength: 80 },
    account_type: { type: 'string', enum: ACCOUNT_TYPES, default: 'Savings', label: 'Account type' },
    last4: { type: 'string', maxLength: 4 },
    balance: { type: 'number', default: 0, label: 'Balance' },
    color: { type: 'string', maxLength: 9, default: '#1baf7a' },
    active: { type: 'bool', default: 1 },
    notes: { type: 'string', maxLength: 500 },
  },
  async beforeSave(row, req, existing) {
    // Saving a balance restarts the running total from now. The edit form is pre-filled with the
    // current (adjusted) balance, so saving other changes keeps the balance where it was.
    if (!existing || row.balance !== undefined) await stampBalance(row);
  },
  async onDelete(acc) {
    for (const t of ['expenses', 'investments', 'income', 'sips']) {
      await db.run(`UPDATE ${t} SET bank_account_id = NULL WHERE bank_account_id = ?`, acc.id);
    }
  },
});

const router = express.Router();
router.get('/overview', ah(async (req, res) => res.json(await accountsOverview(scopeUserId(req)))));
router.use('/', crud);

export default router;
