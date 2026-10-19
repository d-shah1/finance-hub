import { useState } from 'react';
import { CalendarClock, CheckCircle2, LineChart, PiggyBank, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi, useApp } from '../context';
import { api } from '../lib/api';
import { inr, niceDate, pct, todayIso } from '../lib/format';
import { Badge, Empty, Loading, PageHeader, Segmented, StatCard, toast } from '../components/ui';
import { Donut, foldOther } from '../components/charts';
import EntityForm from '../components/EntityForm';

function Plans({ meta, viewingAll }) {
  const { refresh } = useApp();
  const { data, loading } = useApi('/sips/status');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const fields = [
    { name: 'name', label: 'Plan name', required: true, placeholder: 'e.g. Parag Parikh Flexi Cap', span: 2 },
    { name: 'amount', label: 'Monthly amount (₹)', type: 'number', required: true, min: 0 },
    { name: 'day_of_month', label: 'Debit day of month', type: 'number', required: true, min: 1, max: 31 },
    { name: 'type', label: 'Type', type: 'segmented', options: meta?.investmentTypes || [] },
    { name: 'platform', label: 'Platform', placeholder: 'Groww, Zerodha, Kuvera, bank…' },
    { name: 'start_date', label: 'Started on', type: 'date' },
    { name: 'active', label: 'Active', type: 'toggle' },
    { name: 'notes', label: 'Notes', span: 2 },
  ];
  const total = (data || []).filter((s) => s.active).reduce((s, x) => s + x.amount, 0);

  async function logIt(s) {
    await api(`/sips/${s.id}/log`, { method: 'POST', body: {} });
    toast(`${s.name} logged for this month`);
    refresh();
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div>
          <h2 className="font-semibold">Monthly plans (SIPs, RDs…)</h2>
          <p className="muted text-xs">Committed every month: {inr(total)}</p>
        </div>
        {!viewingAll && (
          <button className="btn-secondary py-2" onClick={() => setAdding(true)}>
            <Plus size={16} /> New plan
          </button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty icon={CalendarClock} title="No monthly plans" text="Add SIPs or recurring deposits. You'll be reminded on the debit day and can log each instalment in one tap." />
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEditing(s)}>
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  <span className="text-[10px] leading-none">day</span>
                  <span className="text-sm font-bold leading-none">{s.day_of_month}</span>
                </span>
                <div className="min-w-0">
                  <div className={`truncate font-medium ${s.active ? '' : 'line-through opacity-60'}`}>{s.name}</div>
                  <div className="muted text-xs">
                    {s.type}
                    {s.platform ? ` · ${s.platform}` : ''}
                    {viewingAll ? ` · ${s.user_name}` : ''}
                  </div>
                </div>
              </button>
              <span className="tabular font-semibold">{inr(s.amount)}</span>
              {s.active ? (
                s.logged_this_month ? (
                  <Badge tone="good"><CheckCircle2 size={12} /> Done this month</Badge>
                ) : (
                  <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => logIt(s)}>
                    Log this month
                  </button>
                )
              ) : (
                <Badge>Paused</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <EntityForm
        open={adding || !!editing}
        record={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/sips"
        noun="Plan"
        fields={fields}
        initial={() => ({ type: 'Mutual Fund', day_of_month: 5, active: 1, start_date: todayIso() })}
      />
    </section>
  );
}

function Log({ meta, viewingAll }) {
  const { data, loading } = useApi('/investments', { limit: 200 });
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const fields = [
    { name: 'name', label: 'What did you invest in?', required: true, placeholder: 'e.g. Nifty 50 index fund, SBI FD', span: 2 },
    { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0 },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'type', label: 'Type', type: 'segmented', options: meta?.investmentTypes || [] },
    { name: 'platform', label: 'Platform' },
    { name: 'notes', label: 'Notes' },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-4">
        <h2 className="font-semibold">Investment log</h2>
        {!viewingAll && (
          <button className="btn-secondary py-2" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add investment
          </button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty icon={PiggyBank} title="Nothing logged yet" text="Record one-off investments here: lump sums, FDs, gold, etc." />
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {data.map((r) => (
            <li key={r.id}>
              <button className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-ink-850" onClick={() => setEditing(r)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="muted text-xs">
                    {niceDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {r.type}
                    {r.platform ? ` · ${r.platform}` : ''}
                    {r.sip_id ? ' · SIP' : ''}
                    {viewingAll ? ` · ${r.user_name}` : ''}
                  </div>
                </div>
                <span className="tabular font-semibold">{inr(r.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <EntityForm
        open={adding || !!editing}
        record={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/investments"
        noun="Investment"
        fields={fields}
        initial={() => ({ date: todayIso(), type: 'Mutual Fund' })}
      />
    </section>
  );
}

function Holdings({ viewingAll }) {
  const { refresh } = useApp();
  const { data, loading } = useApi('/holdings');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fields = [
    { name: 'symbol', label: 'Symbol / ticker', required: true, placeholder: 'e.g. INFY, RELIANCE' },
    { name: 'exchange', label: 'Exchange', type: 'select', required: true, options: ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'Other'] },
    { name: 'name', label: 'Company name', span: 2 },
    { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 0 },
    { name: 'avg_price', label: 'Average buy price (₹)', type: 'number', required: true, min: 0 },
    { name: 'current_price', label: 'Current price (₹)', type: 'number', min: 0, hint: 'Leave empty and use “Refresh prices”' },
    { name: 'buy_date', label: 'First bought on', type: 'date' },
    { name: 'sector', label: 'Sector', placeholder: 'IT, Banking, FMCG…' },
    { name: 'notes', label: 'Notes' },
  ];

  const rows = (data || []).map((h) => {
    const cost = h.quantity * h.avg_price;
    const value = h.quantity * (h.current_price ?? h.avg_price);
    return { ...h, cost, value, pnl: value - cost, ret: cost ? (value - cost) / cost : 0 };
  });
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const value = rows.reduce((s, r) => s + r.value, 0);

  async function refreshPrices() {
    setRefreshing(true);
    try {
      const r = await api('/holdings/refresh-prices', { method: 'POST' });
      toast(r.failed.length ? `Updated ${r.updated}; couldn't fetch ${r.failed.map((f) => f.symbol).join(', ')}` : `Updated ${r.updated} prices`, r.updated ? 'good' : 'critical');
      refresh();
    } catch (e) {
      toast(e.message, 'critical');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <h2 className="font-semibold">Stock holdings</h2>
          <p className="muted text-xs">
            Invested {inr(cost)} · Now {inr(value)} ·{' '}
            <span className={value - cost >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {value - cost >= 0 ? '+' : ''}
              {inr(value - cost)} ({pct(cost ? (value - cost) / cost : 0, 1)})
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary py-2" onClick={refreshPrices} disabled={refreshing || !rows.length}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh prices
          </button>
          {!viewingAll && (
            <button className="btn-secondary py-2" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add stock
            </button>
          )}
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon={LineChart} title="No stocks yet" text="Add the shares you hold to track their value and profit or loss." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="muted border-y border-black/5 bg-slate-50/60 text-left text-xs dark:border-white/5 dark:bg-ink-850/60">
                <th className="px-5 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Avg</th>
                <th className="px-3 py-2 text-right font-medium">LTP</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-5 py-2 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-black/5 dark:divide-white/5">
              {rows.map((h) => (
                <tr key={h.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-850" onClick={() => setEditing(h)}>
                  <td className="px-5 py-3">
                    <div className="font-semibold">{h.symbol}</div>
                    <div className="muted text-xs">
                      {h.name || h.exchange}
                      {viewingAll ? ` · ${h.user_name}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">{h.quantity}</td>
                  <td className="px-3 py-3 text-right">{inr(h.avg_price, true)}</td>
                  <td className="px-3 py-3 text-right">{h.current_price != null ? inr(h.current_price, true) : <span className="muted">—</span>}</td>
                  <td className="px-3 py-3 text-right font-medium">{inr(h.value)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${h.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    <span className="inline-flex items-center gap-1">
                      {h.pnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {inr(h.pnl)}
                    </span>
                    <div className="text-xs font-normal">{pct(h.ret, 1)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EntityForm
        open={adding || !!editing}
        record={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/holdings"
        noun="Holding"
        fields={fields}
        initial={{ exchange: 'NSE' }}
      />
    </section>
  );
}

export default function Investments() {
  const { meta, viewingAll } = useApp();
  const [tab, setTab] = useState('plans');
  const { data } = useApi('/insights/summary');

  return (
    <>
      <PageHeader title="Investments" subtitle="Monthly SIPs, one-off investments and your stock portfolio" />
      {data && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-2">
            <StatCard label="Invested this month" value={inr(data.invested)} icon={PiggyBank} tone="violet" />
            <StatCard label="Monthly SIPs" value={inr(data.sipMonthly)} icon={CalendarClock} sub={`${data.sips.length} active plans`} />
            <StatCard label="Total invested (all time)" value={inr(data.totalInvestedAllTime)} icon={PiggyBank} tone="good" />
            <StatCard
              label="Stock portfolio"
              value={inr(data.portfolio.value)}
              icon={LineChart}
              tone={data.portfolio.pnl >= 0 ? 'good' : 'critical'}
              sub={`${data.portfolio.pnl >= 0 ? '+' : ''}${inr(data.portfolio.pnl)} overall`}
            />
          </div>
          <section className="card card-pad">
            <h2 className="mb-3 font-semibold">Where your money is invested</h2>
            {data.investByType.length ? (
              <Donut data={foldOther(data.investByType, 6)} height={150} centerLabel="Total" />
            ) : (
              <Empty title="No investments logged" />
            )}
          </section>
        </div>
      )}
      <div className="mb-4">
        <Segmented
          options={[
            { value: 'plans', label: 'Monthly plans' },
            { value: 'log', label: 'Investment log' },
            { value: 'stocks', label: 'Stock holdings' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'plans' && <Plans meta={meta} viewingAll={viewingAll} />}
      {tab === 'log' && <Log meta={meta} viewingAll={viewingAll} />}
      {tab === 'stocks' && <Holdings viewingAll={viewingAll} />}
    </>
  );
}
