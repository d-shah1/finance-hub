import { useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { useApi, useApp } from '../context';
import { inr, niceDate, todayIso } from '../lib/format';
import { Badge, Empty, Loading, PageHeader } from '../components/ui';
import { BarList, TrendChart } from '../components/charts';
import EntityForm from '../components/EntityForm';

export default function Income() {
  const { meta, viewingAll } = useApp();
  const year = new Date().getFullYear();
  const [range, setRange] = useState('year');
  const from = range === 'year' ? `${year}-01-01` : range === '12m' ? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) : undefined;
  const { data, loading } = useApi('/income', { from });
  const summary = useApi('/insights/summary');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const fields = [
    { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0 },
    { name: 'date', label: 'Date received', type: 'date', required: true },
    { name: 'source', label: 'Source', required: true, placeholder: 'e.g. Employer name, client', span: 2 },
    { name: 'type', label: 'Type', type: 'segmented', options: meta?.incomeTypes || [] },
    { name: 'notes', label: 'Notes', span: 2 },
  ];

  const total = (data || []).reduce((s, r) => s + r.amount, 0);
  const byType = Object.entries(
    (data || []).reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + r.amount }), {})
  )
    .map(([key, t]) => ({ key, total: t }))
    .sort((a, b) => b.total - a.total);

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle="Salary, freelance and every other rupee coming in"
        actions={
          <>
            <select className="input w-auto py-2" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="year">This year</option>
              <option value="12m">Last 12 months</option>
              <option value="all">All time</option>
            </select>
            {!viewingAll && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add earning
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card card-pad">
          <span className="muted text-sm font-medium">Total earned</span>
          <div className="mt-1 text-3xl font-bold tracking-tight">{inr(total)}</div>
          <div className="muted mt-1 text-xs">{data?.length || 0} entries</div>
          {byType.length > 0 && (
            <div className="mt-5">
              <BarList rows={byType} />
            </div>
          )}
        </section>
        <section className="card card-pad lg:col-span-2">
          <h2 className="font-semibold">Earned vs spent</h2>
          <p className="muted mb-3 text-xs">Last 6 months</p>
          {summary.data && <TrendChart data={summary.data.trend} height={240} />}
        </section>
      </div>

      <section className="card mt-4 overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty
            icon={Wallet}
            title="No earnings recorded"
            text="Add your salary and other income so the AI advisor can work out how much to invest."
            action={!viewingAll && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add earning</button>}
          />
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {data.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-ink-850 sm:px-5" onClick={() => setEditing(r)}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <Wallet size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.source}</div>
                    <div className="muted text-xs">
                      {niceDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {viewingAll ? ` · ${r.user_name}` : ''}
                      {r.notes ? ` · ${r.notes}` : ''}
                    </div>
                  </div>
                  <Badge tone="good">{r.type}</Badge>
                  <span className="tabular w-28 text-right font-semibold text-emerald-700 dark:text-emerald-400">+{inr(r.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EntityForm
        open={adding || !!editing}
        record={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/income"
        noun="Earning"
        fields={fields}
        initial={() => ({ date: todayIso(), type: 'Salary' })}
      />
    </>
  );
}
