import { useEffect, useState } from 'react';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context';
import { todayIso } from '../lib/format';
import { ConfirmDelete, ErrorText, Field, Modal, Segmented, toast } from './ui';

const MODE_OPTIONS = [
  { value: 'UPI', label: 'UPI', icon: <Smartphone size={15} /> },
  { value: 'Card', label: 'Card', icon: <CreditCard size={15} /> },
  { value: 'Cash', label: 'Cash', icon: <Banknote size={15} /> },
];

const blank = () => ({
  date: todayIso(),
  amount: '',
  category: 'Food & Dining',
  payment_mode: 'UPI',
  card_id: '',
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
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(expense ? { ...blank(), ...expense, card_id: expense.card_id ?? '', upi_app: expense.upi_app ?? 'GPay' } : blank());
    setMore(!!(expense?.notes || expense?.tags));
    api('/cards', expense ? { params: { userId: expense.user_id } } : undefined)
      .then((c) => setCards(c.filter((x) => x.active)))
      .catch(() => setCards([]));
  }, [open, expense]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, card_id: form.payment_mode === 'Card' ? form.card_id || null : null };
      if (expense) await api(`/expenses/${expense.id}`, { method: 'PUT', body });
      else await api('/expenses', { method: 'POST', body });
      toast(expense ? 'Expense updated' : 'Expense added');
      refresh();
      onSaved?.();
      if (!expense && e?.nativeEvent?.submitter?.dataset?.another) {
        setForm((f) => ({ ...blank(), date: f.date, payment_mode: f.payment_mode, card_id: f.card_id, upi_app: f.upi_app }));
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

  const categories = meta?.categories || [];
  const blocked = viewingAll && !expense;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
      footer={
        <>
          {expense && <ConfirmDelete onConfirm={remove} />}
          <div className="flex-1" />
          {!expense && (
            <button form="expense-form" type="submit" data-another="1" className="btn-secondary" disabled={saving || blocked}>
              Save &amp; add another
            </button>
          )}
          <button form="expense-form" type="submit" className="btn-primary" disabled={saving || blocked}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={save} className="space-y-4">
        {blocked && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            You are viewing everyone. Pick a person in the top bar to add an expense for them, or switch to your own account.
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount (₹)">
            <input
              className="input text-lg font-semibold"
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
          <Field label="Date">
            <input className="input" type="date" required value={form.date} max={todayIso()} onChange={set('date')} />
          </Field>
        </div>

        <div>
          <span className="label">Paid with</span>
          <Segmented options={MODE_OPTIONS} value={form.payment_mode} onChange={set('payment_mode')} />
        </div>

        {form.payment_mode === 'Card' && (
          <Field label="Card" hint={cards.length ? null : 'Add your credit cards on the Cards page to track bills.'}>
            <select className="input" value={form.card_id} onChange={set('card_id')}>
              <option value="">Select a card…</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.last4 ? ` ••${c.last4}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.payment_mode === 'UPI' && (
          <div>
            <span className="label">UPI app</span>
            <Segmented size="sm" options={meta?.upiApps || []} value={form.upi_app} onChange={set('upi_app')} />
          </div>
        )}

        <div>
          <span className="label">Category</span>
          <Segmented size="sm" options={categories} value={form.category} onChange={set('category')} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid to / merchant">
            <input className="input" placeholder="e.g. Swiggy, DMart" value={form.merchant || ''} onChange={set('merchant')} />
          </Field>
          <Field label="Description">
            <input className="input" placeholder="What was it for?" value={form.description || ''} onChange={set('description')} />
          </Field>
        </div>

        <div>
          <span className="label">Was this a need or a want?</span>
          <Segmented
            size="sm"
            options={[
              { value: 1, label: 'Need' },
              { value: 0, label: 'Want' },
            ]}
            value={Number(form.is_need)}
            onChange={set('is_need')}
          />
        </div>

        {more ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tags" hint="Comma separated, e.g. trip-goa, office">
              <input className="input" value={form.tags || ''} onChange={set('tags')} />
            </Field>
            <Field label="Notes">
              <input className="input" value={form.notes || ''} onChange={set('notes')} />
            </Field>
          </div>
        ) : (
          <button type="button" className="text-sm font-medium text-brand-600 dark:text-brand-300" onClick={() => setMore(true)}>
            + Tags and notes
          </button>
        )}
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
