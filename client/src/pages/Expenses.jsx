import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Banknote, CreditCard, Download, Plus, Receipt, Search, Smartphone } from 'lucide-react';
import { useApi, useApp } from '../context';
import { currentMonth, inr, monthBounds, relativeDay } from '../lib/format';
import { Badge, Empty, Loading, MonthPicker, PageHeader, Segmented } from '../components/ui';
import ExpenseForm from '../components/ExpenseForm';

const MODE_ICON = { UPI: Smartphone, Card: CreditCard, Cash: Banknote };

function toCsv(rows) {
  const cols = ['date', 'amount', 'category', 'payment_mode', 'card_name', 'upi_app', 'merchant', 'description', 'is_need', 'tags', 'notes', 'user_name'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c === 'is_need' ? (r.is_need ? 'Need' : 'Want') : r[c])).join(','))].join('\n');
}

export default function Expenses() {
  const { meta, viewingAll } = useApp();
  const { openAddExpense } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState('');
  const [q, setQ] = useState('');
  const category = params.get('category') || '';
  const [editing, setEditing] = useState(null);

  const { from, to } = monthBounds(month);
  const { data, loading } = useApi('/expenses', { from, to, payment_mode: mode, category, q });
  const cards = useApi('/cards');

  const cardName = useMemo(() => Object.fromEntries((cards.data || []).map((c) => [c.id, c.name + (c.last4 ? ` ••${c.last4}` : '')])), [cards.data]);

  const groups = useMemo(() => {
    const g = new Map();
    for (const e of data || []) {
      if (!g.has(e.date)) g.set(e.date, []);
      g.get(e.date).push(e);
    }
    return [...g.entries()];
  }, [data]);

  const total = (data || []).reduce((s, e) => s + e.amount, 0);

  function exportCsv() {
    const rows = (data || []).map((e) => ({ ...e, card_name: cardName[e.card_id] || '' }));
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const setCategory = (c) => {
    if (c) params.set('category', c);
    else params.delete('category');
    setParams(params, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={`${data?.length ?? 0} transactions · ${inr(total)}`}
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <button className="btn-secondary" onClick={exportCsv} disabled={!data?.length}>
              <Download size={16} /> CSV
            </button>
            {!viewingAll && (
              <button className="btn-primary hidden sm:inline-flex" onClick={openAddExpense}>
                <Plus size={16} /> Add
              </button>
            )}
          </>
        }
      />

      <div className="card card-pad mb-4 space-y-3">
        <div className="relative">
          <Search size={16} className="muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Search merchant, description, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented size="sm" options={[{ value: '', label: 'All modes' }, ...(meta?.paymentModes || [])]} value={mode} onChange={setMode} />
          <select className="input w-auto py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(meta?.categories || []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <Loading />
      ) : groups.length === 0 ? (
        <div className="card">
          <Empty
            icon={Receipt}
            title="No expenses found"
            text="Try another month or filter, or add a new expense."
            action={
              !viewingAll && (
                <button className="btn-primary" onClick={openAddExpense}>
                  <Plus size={16} /> Add expense
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, items]) => (
            <section key={date} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/5 bg-slate-50/60 px-4 py-2 text-sm dark:border-white/5 dark:bg-ink-850/60 sm:px-5">
                <span className="font-semibold">{relativeDay(date)}</span>
                <span className="tabular muted font-medium">{inr(items.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {items.map((e) => {
                  const Icon = MODE_ICON[e.payment_mode];
                  return (
                    <li key={e.id}>
                      <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-ink-850 sm:px-5" onClick={() => setEditing(e)}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300">
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{e.merchant || e.description || e.category}</span>
                            {!e.is_need && <Badge tone="warning">Want</Badge>}
                          </div>
                          <div className="muted truncate text-xs">
                            {e.category} · {e.payment_mode === 'Card' ? cardName[e.card_id] || 'Card' : e.payment_mode === 'UPI' ? `UPI${e.upi_app ? ` · ${e.upi_app}` : ''}` : 'Cash'}
                            {e.merchant && e.description ? ` · ${e.description}` : ''}
                            {viewingAll ? ` · ${e.user_name}` : ''}
                          </div>
                        </div>
                        <span className="tabular font-semibold">{inr(e.amount, true)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <ExpenseForm open={!!editing} expense={editing} onClose={() => setEditing(null)} />
    </>
  );
}
