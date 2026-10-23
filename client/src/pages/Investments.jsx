import { useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, LineChart, PiggyBank, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { api } from '@/lib/api';
import { inr, inrShort, niceDate, pct, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, Empty, Loading, Modal, PageHeader, Section, toast } from '@/components/common';
import { Donut, foldOther } from '@/components/charts';
import EntityForm from '@/components/EntityForm';
import { sipDueDates } from '@/lib/sip';
import FundPicker from '@/components/FundPicker';
import { accountField, useAccountOptions } from '@/hooks/useAccountOptions';
import FixedDeposits from './FixedDeposits';

const monthYear = (iso) => niceDate(iso, { month: 'short', year: 'numeric' });
const fullDate = (iso) => niceDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Green/red signed amount with percentage, e.g. "+₹54,620 (19.0%)". */
function Change({ value, base, short = false, className }) {
  const up = value >= 0;
  return (
    <span className={cn('tabular', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400', className)}>
      {up ? '+' : '−'}
      {short ? inrShort(Math.abs(value)).replace('-', '') : inr(Math.abs(value))} ({pct(base ? Math.abs(value) / base : 0, 1)})
    </span>
  );
}

/** Small label-over-value pair used in summaries. */
function Metric({ label, children, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-semibold">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Summary */

function PortfolioSummary({ data }) {
  const invested = data.totalInvestedAllTime;
  const value = data.currentValue;
  const atCost = Math.max(0, data.contributions - data.valuedAtNav);
  const rows = [
    // Without any linked fund these are only known at cost, so a "+₹0" change would mislead.
    { label: 'SIPs & investments', invested: data.contributions, value: data.contributionsValue, atCost: data.valuedAtNav < 0.5 },
    { label: 'Fixed deposits', invested: data.fd?.invested || 0, value: data.fd?.value || 0 },
    { label: 'Stocks', invested: data.portfolio.cost, value: data.portfolio.value },
  ].filter((r) => r.invested > 0);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Current value</div>
            <div className="text-3xl font-semibold tracking-tight sm:text-4xl">{inr(value)}</div>
          </div>
          <div className="flex gap-6">
            <Metric label="Invested">{inr(invested)}</Metric>
            <Metric label="Gain">
              <Change value={value - invested} base={invested} />
            </Metric>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            <Separator className="my-4" />
            <ul className="space-y-2.5 text-sm">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="text-right">
                    <span className="tabular block font-medium">{inr(r.value)}</span>
                    {r.atCost ? (
                      <span className="block text-xs text-muted-foreground">at cost</span>
                    ) : (
                      <Change value={r.value - r.invested} base={r.invested} short className="block text-xs" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span>
            This month: <span className="font-medium text-foreground">{inr(data.invested)}</span> invested
          </span>
          <span>
            SIPs: <span className="font-medium text-foreground">{inr(data.sipMonthly)}</span>/month across {plural(data.sips.length, 'plan')}
          </span>
          {atCost > 0.5 && <span>{inr(atCost)} without a linked fund is shown at cost</span>}
        </div>
      </Card>
      <Section title="Where it's invested" description="By amount put in">
        {data.investByType.length ? <Donut data={foldOther(data.investByType, 5)} height={140} centerLabel="Invested" /> : <Empty title="No investments yet" />}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- Plans */

/** Live note in the plan form: what saving will fill in. */
function PlanPreview({ form, record }) {
  const dates = sipDueDates(form, todayIso());
  const amount = Number(form.amount) || 0;
  if (!form.start_date) return null;
  if (!dates.length) return <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">The first instalment will be logged on its debit day.</p>;
  return (
    <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
      {record ? 'Covers' : 'Saving adds'} {plural(dates.length, 'instalment')}, {monthYear(dates[0])} – {monthYear(dates.at(-1))}
      {amount ? ` · ${inr(dates.length * amount)}` : ''}
    </p>
  );
}

function statusText(s) {
  if (s.end_date && !s.active) return `Stopped ${monthYear(s.end_date)}`;
  if (!s.active) return 'Paused';
  if (s.logged_this_month) return `Done for ${niceDate(s.due_date, { month: 'short' })}`;
  return `Next ${niceDate(s.due_date)}`;
}

function PlanCard({ s, viewingAll, onOpen }) {
  const v = s.valuation;
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          <span className="text-[10px] leading-none">day</span>
          <span className="text-sm font-bold leading-none">{s.day_of_month}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('truncate font-medium', !s.active && 'text-muted-foreground')}>{s.name}</span>
            <span className="tabular shrink-0 font-semibold">{inr(v ? v.value : s.invested)}</span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {inr(s.amount)}/mo · {statusText(s)}
              {viewingAll ? ` · ${s.user_name}` : ''}
            </span>
            <span className="shrink-0">
              {v ? (
                <>
                  <Change value={v.gain} base={v.cost} short />
                  {v.xirr !== null && <span className="ml-2">XIRR {pct(v.xirr, 1)}</span>}
                </>
              ) : (
                'invested'
              )}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/** Everything about one plan: value, returns, NAV, schedule and every instalment. */
function PlanDetail({ plan, ...props }) {
  // Keep showing the last plan while the drawer animates closed.
  const last = useRef(plan);
  if (plan) last.current = plan;
  if (!last.current) return null;
  return <PlanDetailBody plan={last.current} open={!!plan} {...props} />;
}

function PlanDetailBody({ plan, open, accounts, onClose, onEdit }) {
  const { refresh } = useApp();
  const history = useApi('/investments', { sip_id: plan.id, limit: 1000 }, [plan.id]);
  const [busy, setBusy] = useState(false);
  const v = plan.valuation;
  const account = accounts.find((a) => a.value === plan.bank_account_id)?.label;

  async function act(fn, ok) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      refresh();
      history.reload();
    } catch (e) {
      toast(e.message, 'critical');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan.name}
      description={plan.scheme_name || (plan.type === 'Mutual Fund' ? 'No fund linked yet' : plan.type)}
      footer={
        <>
          {plan.active && !plan.logged_this_month ? (
            <Button variant="outline" disabled={busy} onClick={() => act(() => api(`/sips/${plan.id}/log`, { method: 'POST', body: {} }), 'Logged for this month')}>
              Log this month now
            </Button>
          ) : null}
          {plan.scheme_code ? (
            <Button variant="outline" disabled={busy} onClick={() => act(() => api('/mf/refresh', { method: 'POST' }), 'NAV updated')}>
              <RefreshCw className={busy ? 'animate-spin' : ''} /> Update NAV
            </Button>
          ) : null}
          <div className="hidden flex-1 sm:block" />
          <Button onClick={onEdit}>Edit plan</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Metric label={v ? 'Current value' : 'Invested'} className="col-span-2">
            <span className="text-2xl">{inr(v ? v.value : plan.invested)}</span>
          </Metric>
          {v && (
            <>
              <Metric label="Invested">{inr(v.cost)}</Metric>
              <Metric label="Gain">
                <Change value={v.gain} base={v.cost} />
              </Metric>
              <Metric label="XIRR (yearly return)">{v.xirr !== null ? pct(v.xirr, 1) : '—'}</Metric>
              <Metric label={`NAV · ${niceDate(v.nav_date)}`}>
                ₹{v.nav.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">· {v.units.toFixed(3)} units</span>
              </Metric>
            </>
          )}
        </div>

        {!plan.scheme_code && plan.type === 'Mutual Fund' && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Link the fund in Edit plan to see its current value and returns.</p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-3 text-sm">
          <dt className="text-muted-foreground">Amount</dt>
          <dd>
            {inr(plan.amount)} on day {plan.day_of_month} of each month
          </dd>
          <dt className="text-muted-foreground">Running</dt>
          <dd>
            {fullDate(plan.start)} – {plan.end_date ? fullDate(plan.end_date) : plan.active ? 'now' : 'paused'}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{statusText(plan)}</dd>
          {(account || plan.platform) && (
            <>
              <dt className="text-muted-foreground">Paid via</dt>
              <dd>{[plan.platform, account].filter(Boolean).join(' · ')}</dd>
            </>
          )}
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Instalments <span className="font-normal text-muted-foreground">· {plan.instalments}</span>
          </h3>
          {history.loading && !history.data ? (
            <Loading rows={3} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-0">Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {plan.scheme_code && <TableHead className="text-right">NAV</TableHead>}
                  {plan.scheme_code && <TableHead className="pr-0 text-right">Units</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className="tabular text-sm">
                {(history.data || []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-2 pl-0">{fullDate(r.date)}</TableCell>
                    <TableCell className="py-2 text-right">{inr(r.amount)}</TableCell>
                    {plan.scheme_code && <TableCell className="py-2 text-right">{r.nav ? r.nav.toFixed(2) : '—'}</TableCell>}
                    {plan.scheme_code && <TableCell className="py-2 pr-0 text-right">{r.units ? r.units.toFixed(3) : '—'}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Change a month&apos;s amount or remove a skipped month from the Investment log.</p>
        </div>
      </div>
    </Modal>
  );
}

function planFields(meta, accountOptions) {
  const typeOptions = meta?.investmentTypes || ['Mutual Fund'];
  return [
    { section: 'Plan', name: 'name', label: 'Name', required: true, placeholder: 'e.g. Parag Parikh Flexi Cap', span: 2 },
    { section: 'Plan', name: 'amount', label: 'Monthly amount (₹)', type: 'number', required: true, min: 0 },
    { section: 'Plan', name: 'day_of_month', label: 'Debit day', type: 'number', required: true, min: 1, max: 31, hint: 'Day of the month' },
    { section: 'Plan', name: 'type', label: 'Type', type: 'select', required: true, options: typeOptions },
    { section: 'Plan', name: 'bank_account_id', ...accountField(accountOptions), hint: null },
    {
      section: 'Fund',
      name: 'fund',
      keys: ['scheme_code', 'scheme_name'],
      label: 'Mutual fund',
      type: 'custom',
      when: (f) => f.type === 'Mutual Fund',
      hint: 'Pick the exact plan you hold, usually “Direct … Growth”, to see its current value and returns.',
      render: ({ form, set }) => (
        <FundPicker
          value={form.scheme_code ? { code: form.scheme_code, name: form.scheme_name } : null}
          suggest={form.name}
          onChange={(f) => {
            set('scheme_code', f?.code || null);
            set('scheme_name', f?.name || null);
          }}
        />
      ),
    },
    { section: 'Dates', name: 'start_date', label: 'Started on', type: 'date', required: true, max: todayIso(), hint: 'Past months are filled in' },
    { section: 'Dates', name: 'end_date', label: 'Stopped on', type: 'date', max: todayIso(), hint: 'Only if it has ended', more: true },
    { section: 'Dates', name: 'active', label: 'Active', type: 'toggle' },
    { section: 'Dates', name: 'platform', label: 'Platform', placeholder: 'Groww, Zerodha, Kuvera…', more: true },
    { section: 'Dates', name: 'notes', label: 'Notes', span: 2, more: true },
  ];
}

function Plans({ meta, viewingAll, accountOptions }) {
  const { data, loading } = useApi('/sips/status');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const plans = data || [];
  const open = plans.find((p) => p.id === openId) || null;
  const active = plans.filter((s) => s.active);
  const navDate = plans.map((s) => s.valuation?.nav_date).filter(Boolean).sort().at(-1);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <h2 className="font-semibold">Monthly plans</h2>
          <p className="text-xs text-muted-foreground">
            {plural(active.length, 'active plan')} · {inr(active.reduce((t, x) => t + x.amount, 0))}/month
            {navDate ? ` · NAVs as of ${niceDate(navDate)}` : ''}
          </p>
        </div>
        {!viewingAll && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> New plan
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !plans.length ? (
        <Empty
          icon={CalendarClock}
          title="No monthly plans"
          text="Add your SIPs or recurring deposits with the date they started. Past instalments are filled in, and new ones are logged automatically on each debit day."
        />
      ) : (
        <ul className="divide-y border-t">
          {plans.map((s) => (
            <PlanCard key={s.id} s={s} viewingAll={viewingAll} onOpen={() => setOpenId(s.id)} />
          ))}
        </ul>
      )}
      <PlanDetail
        plan={open}
        accounts={accountOptions}
        onClose={() => setOpenId(null)}
        onEdit={() => {
          setEditing({ ...open, start_date: open.start_date || open.start });
          setOpenId(null);
        }}
      />
      <EntityForm
        open={adding || !!editing}
        record={editing}
        title={editing ? `Edit ${editing.name}` : 'New plan'}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/sips"
        noun="Plan"
        fields={planFields(meta, accountOptions)}
        initial={() => ({ type: 'Mutual Fund', day_of_month: 5, active: 1, start_date: todayIso() })}
        extra={(form) => <PlanPreview form={form} record={editing} />}
      />
    </Card>
  );
}

/* ---------------------------------------------------------------- Log */

function Log({ meta, viewingAll, accountOptions }) {
  const { data, loading } = useApi('/investments', { limit: 2000 });
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const fields = [
    { section: 'Investment', name: 'name', label: 'What did you invest in?', required: true, placeholder: 'e.g. SBI FD, Sovereign Gold Bond', span: 2 },
    { section: 'Investment', name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0 },
    { section: 'Investment', name: 'date', label: 'Date', type: 'date', required: true },
    { section: 'Investment', name: 'type', label: 'Type', type: 'select', required: true, options: meta?.investmentTypes || ['Mutual Fund'] },
    { section: 'Investment', name: 'bank_account_id', ...accountField(accountOptions), hint: null },
    { section: 'Investment', name: 'platform', label: 'Platform', more: true },
    { section: 'Investment', name: 'notes', label: 'Notes', span: 2, more: true },
  ];

  // Group by month so years of SIP instalments stay readable.
  const groups = [];
  for (const r of data || []) {
    const key = r.date.slice(0, 7);
    if (groups.at(-1)?.key !== key) groups.push({ key, rows: [], total: 0 });
    groups.at(-1).rows.push(r);
    groups.at(-1).total += r.amount;
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <h2 className="font-semibold">Investment log</h2>
          <p className="text-xs text-muted-foreground">Every instalment and one-off investment, newest first</p>
        </div>
        {!viewingAll && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add investment
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !groups.length ? (
        <Empty icon={PiggyBank} title="Nothing logged yet" text="Record one-off investments here: lump sums, FDs, gold, etc." />
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <div className="flex items-center justify-between border-y bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground sm:px-5">
              <span>{monthYear(`${g.key}-01`)}</span>
              <span className="tabular">{inr(g.total)}</span>
            </div>
            <ul className="divide-y">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 sm:px-5" onClick={() => setEditing(r)}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {niceDate(r.date)} · {r.sip_id ? 'SIP' : r.type}
                        {viewingAll ? ` · ${r.user_name}` : ''}
                      </div>
                    </div>
                    <span className="tabular text-sm font-semibold">{inr(r.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
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

/* ---------------------------------------------------------------- Stocks */

function timeAgo(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Groww connection status and "Sync now" for the person being viewed. */
function GrowwBar() {
  const { refresh } = useApp();
  const { data, reload } = useApi('/holdings/groww');
  const [syncing, setSyncing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  if (!data || data.everyone) return null;

  async function sync() {
    setSyncing(true);
    try {
      const r = await api('/holdings/groww/sync', { method: 'POST' });
      toast(`Synced ${r.count} stock${r.count === 1 ? '' : 's'} from Groww`);
      refresh();
    } catch (e) {
      toast(e.message, 'critical');
    } finally {
      setSyncing(false);
      reload();
    }
  }

  const last = data.last;
  const prefix = data.envPrefix;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t bg-muted/40 px-4 py-2.5 text-sm sm:px-5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-[11px] font-bold text-white" aria-hidden>
        G
      </span>
      {data.configured ? (
        <span className="flex-1 text-muted-foreground">
          {!last ? (
            'Groww connected. Stocks sync every morning.'
          ) : last.ok ? (
            <>
              Synced from Groww <span className="text-foreground">{timeAgo(last.at)}</span> · {last.count} stocks · updates every morning
            </>
          ) : (
            <span className="text-destructive">Last Groww sync failed ({timeAgo(last.at)}): {last.error}</span>
          )}
        </span>
      ) : (
        <span className="flex-1 text-muted-foreground">Connect Groww to fill this list automatically every morning.</span>
      )}
      {data.configured ? (
        <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
          <RefreshCw className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
          How to connect
        </Button>
      )}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Connect Groww" description="Stocks only. The app reads holdings and never places orders.">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>In Groww, open Profile → Settings → Trading APIs and create a key with the TOTP option. (Groww's free trial plan includes holdings.)</li>
          <li>
            In Vercel → Project → Settings → Environment Variables, add <code className="rounded bg-muted px-1">{prefix}_TOTP_TOKEN</code> (the long token) and{' '}
            <code className="rounded bg-muted px-1">{prefix}_TOTP_SECRET</code> (the secret).
          </li>
          <li>Redeploy. The list then syncs every morning, or tap Sync now.</li>
        </ol>
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          These keys can trade on your account. Only ever paste them into Vercel, never into chats, emails or this app.
        </p>
      </Modal>
    </div>
  );
}

function Holdings({ viewingAll }) {
  const { refresh } = useApp();
  const { data, loading } = useApi('/holdings');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fields = [
    { section: 'Stock', name: 'symbol', label: 'Symbol / ticker', required: true, placeholder: 'e.g. INFY, RELIANCE' },
    { section: 'Stock', name: 'exchange', label: 'Exchange', type: 'select', required: true, options: ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'Other'] },
    { section: 'Holding', name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 0 },
    { section: 'Holding', name: 'avg_price', label: 'Average buy price (₹)', type: 'number', required: true, min: 0 },
    { section: 'Holding', name: 'name', label: 'Company name', span: 2, more: true },
    { section: 'Holding', name: 'current_price', label: 'Current price (₹)', type: 'number', min: 0, hint: 'Filled by “Refresh prices”', more: true },
    { section: 'Holding', name: 'buy_date', label: 'First bought on', type: 'date', more: true },
    { section: 'Holding', name: 'sector', label: 'Sector', placeholder: 'IT, Banking, FMCG…', more: true },
    { section: 'Holding', name: 'notes', label: 'Notes', span: 2, more: true },
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
      <GrowwBar />
      {loading && !data ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon={LineChart} title="No stocks yet" text="Add the shares you hold, or connect Groww to bring them in automatically." />
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
                  <div className="flex items-center gap-1.5 font-semibold">
                    {h.symbol}
                    {h.source === 'groww' && (
                      <Badge tone="good" className="px-1.5 py-0 text-[10px]">
                        Groww
                      </Badge>
                    )}
                  </div>
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
  const accountOptions = useAccountOptions();

  return (
    <>
      <PageHeader title="Investments" subtitle="SIPs, fixed deposits, one-off investments and stocks" />
      {data && <PortfolioSummary data={data} />}
      <Tabs defaultValue="plans">
        <TabsList className="mb-2">
          <TabsTrigger value="plans">SIPs</TabsTrigger>
          <TabsTrigger value="fds">FDs</TabsTrigger>
          <TabsTrigger value="stocks">Stocks</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <Plans meta={meta} viewingAll={viewingAll} accountOptions={accountOptions} />
        </TabsContent>
        <TabsContent value="fds">
          <FixedDeposits viewingAll={viewingAll} accountOptions={accountOptions} />
        </TabsContent>
        <TabsContent value="log">
          <Log meta={meta} viewingAll={viewingAll} accountOptions={accountOptions} />
        </TabsContent>
        <TabsContent value="stocks">
          <Holdings viewingAll={viewingAll} />
        </TabsContent>
      </Tabs>
    </>
  );
}
