import { useApi } from '@/context';

/** Active bank accounts of the person being viewed, as select options for forms. */
export function useAccountOptions() {
  const { data } = useApi('/accounts');
  return (data || [])
    .filter((a) => a.active)
    .map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ''}` }));
}

/** Form field for picking the bank account money leaves from (or, for income, lands in). */
export function accountField(options, label = 'Debited from') {
  return {
    name: 'bank_account_id',
    label,
    type: 'select',
    options,
    noneLabel: 'No bank account',
    hint: options.length ? null : 'Add accounts on the Bank accounts page to track balances.',
  };
}
