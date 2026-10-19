import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, PiggyBank, Plus, Receipt, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { useApi, useApp } from '../context';
import { currentMonth, inr, monthLabel, niceDate, pct, relativeDay } from '../lib/format';
import { Badge, Empty, Loading, MonthPicker, PageHeader, StatCard } from '../components/ui';
import { BarList, DailyChart, Donut, TrendChart, foldOther, modeColor } from '../components/charts';
import { RecommendationList } from './Insights';
import { CardStatusBadge } from './Cards';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { user, viewingAll, people, viewing, isAdmin } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const { data, loading } = useApi('/insights/summary', { month }, [month]);
  const recent = useApi('/expenses', { limit: 6 });
  const sips = useApi('/sips/status');
  const { openAddExpense } = useOutletContext();
  const navigate = useNavigate();

  const who = isAdmin ? (viewingAll ? 'everyone' : people.find((p) => String(p.id) === viewing)?.name) : null;

  if (loading && !data) return <Loading />;
  if (!data) return null;

  const pendingSips = (sips.data || []).filter((s) => s.active && !s.logged_this_month);
  const cardAlerts = data.cards.filter((c) => c.status !== 'paid' && c.days_to_due <= 10);
  const prev = data.trend.at(-2);
  const spendDelta = prev?.expenses ? (data.expenses - prev.expenses) / prev.expenses : null;

  return (
    <>
      <PageHeader
        title={isAdmin ? `Overview · ${who || ''}` : `${greeting()}, ${user.name}`}
        subtitle={`Your money in ${monthLabel(month)}`}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Earned" value={inr(data.income)} icon={Wallet} tone="good" sub={data.avgIncome ? `3-month avg ${inr(data.avgIncome)}` : 'Add your earnings'} />
        <StatCard
          label="Spent"
          value={inr(data.expenses)}
          icon={Receipt}
          tone="warning"
          sub={
            spendDelta === null ? (
              `${data.byCategory.reduce((s, c) => s + c.count, 0)} transactions`
            ) : (
              <span className="inline-flex items-center gap-1">
                {spendDelta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {pct(Math.abs(spendDelta))} {spendDelta > 0 ? 'more' : 'less'} than last month
              </span>
            )
          }
        >
          {data.budget ? (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800">
                <div
                  className={`h-full rounded-full ${data.expenses > data.budget ? 'bg-red-500' : 'bg-brand-500'}`}
                  style={{ width: `${Math.min(100, (data.expenses / data.budget) * 100)}%` }}
                />
              </div>
              <div className="muted mt-1 text-[11px]">of {inr(data.budget)} budget</div>
            </div>
          ) : null}
        </StatCard>
        <StatCard label="Invested" value={inr(data.invested)} icon={PiggyBank} tone="violet" sub={data.sipMonthly ? `SIPs: ${inr(data.sipMonthly)}/month` : 'No SIPs yet'} />
        <StatCard
          label="Left over"
          value={inr(data.net)}
          icon={TrendingUp}
          tone={data.net >= 0 ? 'brand' : 'critical'}
          sub={data.income ? `Savings rate ${pct(data.savingsRate)}` : '—'}
        />
      </div>

      {(cardAlerts.length > 0 || pendingSips.length > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {cardAlerts.map((c) => (
            <Link to="/cards" key={c.name + c.due_date} className="card card-pad flex items-center gap-3 transition hover:border-brand-300">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                <CreditCard size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="muted text-xs">
                  Bill {inr(c.billed)} · due {niceDate(c.due_date)}
                </div>
              </div>
              <CardStatusBadge status={c.status} days={c.days_to_due} />
            </Link>
          ))}
          {pendingSips.slice(0, 4).map((s) => (
            <Link to="/investments" key={s.id} className="card card-pad flex items-center gap-3 transition hover:border-brand-300">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
                <CalendarClock size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="muted text-xs">
                  {inr(s.amount)} · {niceDate(s.due_date)}
                </div>
              </div>
              <Badge tone="brand">Not logged</Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card card-pad lg:col-span-3">
          <h2 className="font-semibold">Last 6 months</h2>
          <p className="muted mb-3 text-xs">Earned, spent and invested each month</p>
          <TrendChart data={data.trend} />
        </section>
        <section className="card card-pad lg:col-span-2">
          <h2 className="font-semibold">How you paid</h2>
          <p className="muted mb-4 text-xs">UPI, card and cash this month</p>
          {data.byMode.length ? (
            <Donut data={data.byMode} colorFor={modeColor} centerLabel="Spent" />
          ) : (
            <Empty icon={Receipt} title="No spending yet" text="Expenses you add will show up here." />
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card card-pad lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Where it went</h2>
              <p className="muted text-xs">Spending by category</p>
            </div>
            <Link to="/expenses" className="text-sm font-medium text-brand-600 dark:text-brand-300">
              See all
            </Link>
          </div>
          {data.byCategory.length ? (
            <BarList rows={foldOther(data.byCategory, 7)} onSelect={(r) => r.key !== 'Other' && navigate(`/expenses?category=${encodeURIComponent(r.key)}`)} />
          ) : (
            <Empty icon={Receipt} title="Nothing spent this month" />
          )}
        </section>
        <section className="card card-pad lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles size={16} className="text-violet-500" /> Quick advice
            </h2>
            <Link to="/insights" className="text-sm font-medium text-brand-600 dark:text-brand-300">
              Ask AI
            </Link>
          </div>
          <RecommendationList items={data.advice.recommendations.slice(0, 3)} compact />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card card-pad lg:col-span-3">
          <h2 className="font-semibold">Daily spending</h2>
          <p className="muted mb-3 text-xs">{monthLabel(month)}</p>
          {data.daily.length ? <DailyChart data={data.daily} /> : <Empty title="No expenses this month" />}
        </section>
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5">
            <h2 className="font-semibold">Recent</h2>
            {!viewingAll && (
              <button className="btn-ghost py-1.5 text-sm" onClick={openAddExpense}>
                <Plus size={15} /> Add
              </button>
            )}
          </div>
          {recent.data?.length ? (
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {recent.data.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.merchant || e.description || e.category}</div>
                    <div className="muted text-xs">
                      {relativeDay(e.date)} · {e.payment_mode}
                      {viewingAll ? ` · ${e.user_name}` : ''}
                    </div>
                  </div>
                  <span className="tabular text-sm font-semibold">{inr(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Receipt} title="No expenses yet" text="Tap + to log your first one." />
          )}
        </section>
      </div>
    </>
  );
}
