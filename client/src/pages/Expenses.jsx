import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Banknote, CreditCard, Download, Plus, Receipt, Search, Smartphone } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { currentMonth, inr, monthBounds, relativeDay } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge, Empty, Loading, MonthPicker, PageHeader, Segmented } from '@/components/common';
import ExpenseForm from '@/components/ExpenseForm';

const MODE_ICON = { UPI: Smartphone, Card: CreditCard, Cash: Banknote };
const ALL = 'all';

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
    if (c && c !== ALL) params.set('category', c);
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
            <Button variant="outline" onClick={exportCsv} disabled={!data?.length}>
              <Download /> CSV
            </Button>
            {!viewingAll && (
              <Button className="hidden sm:inline-flex" onClick={openAddExpense}>
                <Plus /> Add
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search merchant, description, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented size="sm" options={[{ value: '', label: 'All modes' }, ...(meta?.paymentModes || [])]} value={mode} onChange={setMode} />
          <Select value={category || ALL} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(meta?.categories || []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading && !data ? (
        <Loading rows={6} />
      ) : groups.length === 0 ? (
        <Card>
          <Empty
            icon={Receipt}
            title="No expenses found"
            text="Try another month or filter, or add a new expense."
            action={
              !viewingAll && (
                <Button onClick={openAddExpense}>
                  <Plus /> Add expense
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, items]) => (
            <Card key={date} className="overflow-hidden">
              <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2 text-sm sm:px-5">
                <span className="font-medium">{relativeDay(date)}</span>
                <span className="tabular font-medium text-muted-foreground">{inr(items.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
              <ul className="divide-y">
                {items.map((e) => {
                  const Icon = MODE_ICON[e.payment_mode];
                  return (
                    <li key={e.id}>
                      <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5" onClick={() => setEditing(e)}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{e.merchant || e.description || e.category}</span>
                            {!e.is_need && <Badge tone="warning">Want</Badge>}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
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
            </Card>
          ))}
        </div>
      )}
      <ExpenseForm open={!!editing} expense={editing} onClose={() => setEditing(null)} />
    </>
  );
}
