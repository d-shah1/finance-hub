import { useState } from 'react';
import { CalendarClock, CheckCircle2, LineChart, PiggyBank, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { api } from '@/lib/api';
import { inr, niceDate, pct, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, Empty, Loading, PageHeader, Section, StatCard, toast } from '@/components/common';
import { Donut, foldOther } from '@/components/charts';
import EntityForm from '@/components/EntityForm';

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
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <h2 className="font-semibold">Monthly plans (SIPs, RDs…)</h2>
          <p className="text-xs text-muted-foreground">Committed every month: {inr(total)}</p>
        </div>
        {!viewingAll && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> New plan
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty icon={CalendarClock} title="No monthly plans" text="Add SIPs or recurring deposits. You'll be reminded on the debit day and can log each instalment in one tap." />
      ) : (
        <ul className="divide-y border-t">
          {data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEditing(s)}>
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  <span className="text-[10px] leading-none">day</span>
                  <span className="text-sm font-bold leading-none">{s.day_of_month}</span>
                </span>
                <div className="min-w-0">
                  <div className={`truncate font-medium ${s.active ? '' : 'line-through opacity-60'}`}>{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.type}
                    {s.platform ? ` · ${s.platform}` : ''}
                    {viewingAll ? ` · ${s.user_name}` : ''}
                  </div>
                </div>
              </button>
              <span className="tabular font-semibold">{inr(s.amount)}</span>
              {s.active ? (
                s.logged_this_month ? (
                  <Badge tone="good">
                    <CheckCircle2 /> Done this month
                  </Badge>
                ) : (
                  <Button size="sm" onClick={() => logIt(s)}>
                    Log this month
                  </Button>
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
    </Card>
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
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <h2 className="font-semibold">Investment log</h2>
        {!viewingAll && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add investment
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty icon={PiggyBank} title="Nothing logged yet" text="Record one-off investments here: lump sums, FDs, gold, etc." />
      ) : (
        <ul className="divide-y border-t">
          {data.map((r) => (
            <li key={r.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5" onClick={() => setEditing(r)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
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
    </Card>
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
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <h2 className="font-semibold">Stock holdings</h2>
          <p className="text-xs text-muted-foreground">
            Invested {inr(cost)} · Now {inr(value)} ·{' '}
            <span className={value - cost >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {value - cost >= 0 ? '+' : ''}
              {inr(value - cost)} ({pct(cost ? (value - cost) / cost : 0, 1)})
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshPrices} disabled={refreshing || !rows.length}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} /> Refresh prices
          </Button>
          {!viewingAll && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add stock
            </Button>
          )}
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon={LineChart} title="No stocks yet" text="Add the shares you hold to track their value and profit or loss." />
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4 sm:pl-5">Stock</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">LTP</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="pr-4 text-right sm:pr-5">P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular">
            {rows.map((h) => (
              <TableRow key={h.id} className="cursor-pointer" onClick={() => setEditing(h)}>
                <TableCell className="py-3 pl-4 sm:pl-5">
                  <div className="font-semibold">{h.symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.name || h.exchange}
                    {viewingAll ? ` · ${h.user_name}` : ''}
                  </div>
                </TableCell>
                <TableCell className="text-right">{h.quantity}</TableCell>
                <TableCell className="text-right">{inr(h.avg_price, true)}</TableCell>
                <TableCell className="text-right">{h.current_price != null ? inr(h.current_price, true) : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right font-medium">{inr(h.value)}</TableCell>
                <TableCell className={cn('pr-4 text-right font-semibold sm:pr-5', h.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  <span className="inline-flex items-center gap-1">
                    {h.pnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {inr(h.pnl)}
                  </span>
                  <div className="text-xs font-normal">{pct(h.ret, 1)}</div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </Card>
  );
}

export default function Investments() {
  const { meta, viewingAll } = useApp();
  const { data } = useApi('/insights/summary');

  return (
    <>
      <PageHeader title="Investments" subtitle="Monthly SIPs, one-off investments and your stock portfolio" />
      {data && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
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
          <Section title="Where your money is invested">
            {data.investByType.length ? <Donut data={foldOther(data.investByType, 6)} height={150} centerLabel="Total" /> : <Empty title="No investments logged" />}
          </Section>
        </div>
      )}
      <Tabs defaultValue="plans">
        <TabsList className="mb-2">
          <TabsTrigger value="plans">Monthly plans</TabsTrigger>
          <TabsTrigger value="log">Investment log</TabsTrigger>
          <TabsTrigger value="stocks">Stock holdings</TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <Plans meta={meta} viewingAll={viewingAll} />
        </TabsContent>
        <TabsContent value="log">
          <Log meta={meta} viewingAll={viewingAll} />
        </TabsContent>
        <TabsContent value="stocks">
          <Holdings viewingAll={viewingAll} />
        </TabsContent>
      </Tabs>
    </>
  );
}
