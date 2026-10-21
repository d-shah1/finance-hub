import { crudRouter } from '../lib/crud.js';
import { INCOME_TYPES } from '../lib/constants.js';
import { checkBankAccount } from '../lib/accounts.js';

export default crudRouter({
  table: 'income',
  dateColumn: 'date',
  orderBy: 't.date DESC, t.id DESC',
  fields: {
    date: { type: 'date', required: true, label: 'Date' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    source: { type: 'string', required: true, maxLength: 120, label: 'Source' },
    type: { type: 'string', enum: INCOME_TYPES, default: 'Salary', label: 'Type' },
    bank_account_id: { type: 'int' },
    notes: { type: 'string', maxLength: 1000 },
  },
  beforeSave: (row, req, existing) => checkBankAccount(row.bank_account_id, existing?.user_id ?? row.user_id),
});
