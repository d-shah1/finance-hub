import { useEffect, useState } from 'react';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context';
import { todayIso } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDelete, ErrorText, Field, Modal, Segmented, toast } from './common';

const MODE_OPTIONS = [
  { value: 'UPI', label: 'UPI', icon: <Smartphone /> },
  { value: 'Card', label: 'Card', icon: <CreditCard /> },
  { value: 'Cash', label: 'Cash', icon: <Banknote /> },
];

const LAST_ACCOUNT = 'fh-last-bank-account';
const NONE = 'none';

function lastAccount() {
  try {
    return localStorage.getItem(LAST_ACCOUNT) || '';
  } catch {
    return '';
  }
}

const accountLabel = (a) => `${a.name}${a.last4 ? ` ••${a.last4}` : ''}`;

const blank = () => ({
  date: todayIso(),
  amount: '',
  category: 'Food & Dining',
  payment_mode: 'UPI',
  card_id: '',
  bank_account_id: '',
  debit: false, // Card mode: paid with the bank account's debit card rather than a credit card
  upi_app: 'GPay',
  merchant: '',
  description: '',
  tags: '',
  is_need: 1,
  notes: '',
});

export default function ExpenseForm({ open, onClose, expense, onSaved }) {
  const { meta, refresh, viewingAll } = useApp();
  const [form, setForm] = useState(blank);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      expense
        ? {
            ...blank(),
            ...expense,
            card_id: expense.card_id ? String(expense.card_id) : '',
            bank_account_id: expense.bank_account_id ? String(expense.bank_account_id) : '',
            debit: expense.payment_mode === 'Card' && !expense.card_id && !!expense.bank_account_id,
            upi_app: expense.upi_app ?? 'GPay',
          }
        : blank()
    );
    setMore(!!(expense?.notes || expense?.tags));
    const scope = expense ? { params: { userId: expense.user_id } } : undefined;
    api('/cards', scope)
      .then((c) => setCards(c.filter((x) => x.active)))
      .catch(() => setCards([]));
    api('/accounts', scope)
      .then((list) => {
        const active = list.filter((x) => x.active);
        setAccounts(active);
        if (!expense) {
          // New expense: default to the account used last time, or the only one.
          const last = lastAccount();
          const pick = active.find((a) => String(a.id) === last) || (active.length === 1 ? active[0] : null);
          if (pick) setForm((f) => (f.bank_account_id ? f : { ...f, bank_account_id: String(pick.id) }));
        }
      })
      .catch(() => setAccounts([]));
  }, [open, expense]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const mode = form.payment_mode;
      const { debit, ...rest } = form;
      const body = {
        ...rest,
        card_id: mode === 'Card' ? form.card_id || null : null,
        // UPI and debit cards come out of a bank account; cash and credit cards don't.
        bank_account_id: mode === 'UPI' || (mode === 'Card' && debit) ? form.bank_account_id || null : null,
      };
      try {
        if (body.bank_account_id) localStorage.setItem(LAST_ACCOUNT, String(body.bank_account_id));
      } catch {
        /* storage unavailable */
      }
      if (expense) await api(`/expenses/${expense.id}`, { method: 'PUT', body });
      else await api('/expenses', { method: 'POST', body });
      toast(expense ? 'Expense updated' : 'Expense added');
      refresh();
      onSaved?.();
      if (!expense && e?.nativeEvent?.submitter?.dataset?.another) {
        setForm((f) => ({ ...blank(), date: f.date, payment_mode: f.payment_mode, card_id: f.card_id, bank_account_id: f.bank_account_id, debit: f.debit, upi_app: f.upi_app }));
      } else {
        onClose();
      }
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await api(`/expenses/${expense.id}`, { method: 'DELETE' });
    toast('Expense deleted');
    refresh();
    onClose();
  }

  const blocked = viewingAll && !expense;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
      footer={
        <>
          {expense && <ConfirmDelete onConfirm={remove} />}
          <div className="hidden flex-1 sm:block" />
          {!expense && (
            <Button form="expense-form" type="submit" data-another="1" variant="outline" disabled={saving || blocked}>
              Save &amp; add another
            </Button>
          )}
          <Button form="expense-form" type="submit" disabled={saving || blocked}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={save} className="space-y-5">
        {blocked && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            You are viewing everyone. Pick a person in the top bar to add an expense for them, or switch to your own account.
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount (₹)" htmlFor="exp-amount">
            <Input
              id="exp-amount"
              className="h-11 text-lg font-semibold"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              autoFocus={!expense}
              placeholder="0"
              value={form.amount}
              onChange={set('amount')}
            />
          </Field>
          <Field label="Date" htmlFor="exp-date">
            <Input id="exp-date" className="h-11" type="date" required value={form.date} max={todayIso()} onChange={set('date')} />
          </Field>
        </div>

        <Field label="Paid with">
          <Segmented options={MODE_OPTIONS} value={form.payment_mode} onChange={set('payment_mode')} />
        </Field>

        {form.payment_mode === 'Card' && (
          <Field label="Card" hint={cards.length || accounts.length ? null : 'Add credit cards on the Cards page, or bank accounts for debit cards.'}>
            <Select
              value={form.card_id ? `card:${form.card_id}` : form.debit && form.bank_account_id ? `bank:${form.bank_account_id}` : undefined}
              onValueChange={(v) => {
                const [kind, id] = v.split(':');
                setForm((f) =>
                  kind === 'card' ? { ...f, card_id: id, debit: false } : { ...f, card_id: '', debit: true, bank_account_id: id }
                );
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a card…" />
              </SelectTrigger>
              <SelectContent>
                {cards.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground">Credit cards</SelectLabel>
                    {cards.map((c) => (
                      <SelectItem key={`c${c.id}`} value={`card:${c.id}`}>
                        {c.name}
                        {c.last4 ? ` ••${c.last4}` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {accounts.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground">Debit cards (from bank account)</SelectLabel>
                    {accounts.map((a) => (
                      <SelectItem key={`b${a.id}`} value={`bank:${a.id}`}>
                        {accountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </Field>
        )}
        {form.payment_mode === 'UPI' && (
          <>
            <Field label="Paid from" hint={accounts.length ? null : 'Add your bank accounts on the Bank accounts page to track balances.'}>
              <Select value={form.bank_account_id || NONE} onValueChange={(v) => setForm((f) => ({ ...f, bank_account_id: v === NONE ? '' : v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No bank account</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {accountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="UPI app">
              <Segmented scroll size="sm" options={meta?.upiApps || []} value={form.upi_app} onChange={set('upi_app')} />
            </Field>
          </>
        )}

        <Field label="Category">
          <Segmented scroll size="sm" options={meta?.categories || []} value={form.category} onChange={set('category')} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid to / merchant" htmlFor="exp-merchant">
            <Input id="exp-merchant" placeholder="e.g. Swiggy, DMart" value={form.merchant || ''} onChange={set('merchant')} />
          </Field>
          <Field label="Description" htmlFor="exp-desc">
            <Input id="exp-desc" placeholder="What was it for?" value={form.description || ''} onChange={set('description')} />
          </Field>
        </div>

        <Field label="Was this a need or a want?">
          <Segmented
            size="sm"
            options={[
              { value: 1, label: 'Need' },
              { value: 0, label: 'Want' },
            ]}
            value={Number(form.is_need)}
            onChange={set('is_need')}
          />
        </Field>

        {more ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tags" hint="Comma separated, e.g. trip-goa, office" htmlFor="exp-tags">
              <Input id="exp-tags" value={form.tags || ''} onChange={set('tags')} />
            </Field>
            <Field label="Notes" htmlFor="exp-notes">
              <Input id="exp-notes" value={form.notes || ''} onChange={set('notes')} />
            </Field>
          </div>
        ) : (
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => setMore(true)}>
            + Tags and notes
          </Button>
        )}
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
