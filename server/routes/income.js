import { crudRouter } from '../lib/crud.js';
import { INCOME_TYPES } from '../lib/constants.js';

export default crudRouter({
  table: 'income',
  dateColumn: 'date',
  orderBy: 't.date DESC, t.id DESC',
  fields: {
    date: { type: 'date', required: true, label: 'Date' },
    amount: { type: 'number', required: true, min: 0.01, label: 'Amount' },
    source: { type: 'string', required: true, maxLength: 120, label: 'Source' },
    type: { type: 'string', enum: INCOME_TYPES, default: 'Salary', label: 'Type' },
    notes: { type: 'string', maxLength: 1000 },
  },
});
