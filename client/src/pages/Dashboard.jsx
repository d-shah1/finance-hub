import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, PiggyBank, Plus, Receipt, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { currentMonth, inr, monthLabel, niceDate, pct, relativeDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge, Empty, IconTile, Loading, MonthPicker, PageHeader, Section, StatCard } from '@/components/common';
import { BarList, DailyChart, Donut, TrendChart, foldOther, modeColor } from '@/components/charts';
import { RecommendationList } from './Insights';
import { CardStatusBadge } from './Cards';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function AlertLink({ to, icon, tone, title, sub, badge }) {
  return (
    <Link to={to} className="group">
      <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-primary/40">
        <IconTile icon={icon} tone={tone} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
        {badge}
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { user, viewingAll, people, viewing, isAdmin } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const { data, loading } = useApi('/insights/summary', { month }, [month]);
  const recent = useApi('/expenses', { limit: 6 });
  const sips = useApi('/sips/status');
  const { openAddExpense } = useOutletContext();
  const navigate = useNavigate();

  const who = isAdmin ? (viewingAll ? 'Everyone' : people.find((p) => String(p.id) === viewing)?.name) : null;

  if (loading && !data) return <Loading rows={5} />;
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
                {spendDelta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {pct(Math.abs(spendDelta))} {spendDelta > 0 ? 'more' : 'less'} than last month
              </span>
            )
          }
        >
          {data.budget ? (
            <div className="mt-2">
              <Progress
                value={(data.expenses / data.budget) * 100}
                className="h-1.5 bg-muted"
                indicatorClassName={data.expenses > data.budget ? 'bg-destructive' : 'bg-primary'}
                aria-label="Budget used"
              />
              <div className="mt-1 text-[11px] text-muted-foreground">of {inr(data.budget)} budget</div>
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
            <AlertLink
              key={c.name + c.due_date}
              to="/cards"
              icon={CreditCard}
              tone="warning"
              title={c.name}
              sub={`Bill ${inr(c.billed)} · due ${niceDate(c.due_date)}`}
              badge={<CardStatusBadge status={c.status} days={c.days_to_due} />}
            />
          ))}
          {pendingSips.slice(0, 4).map((s) => (
            <AlertLink
              key={s.id}
              to="/investments"
              icon={CalendarClock}
              tone="violet"
              title={s.name}
              sub={`${inr(s.amount)} · ${niceDate(s.due_date)}`}
              badge={<Badge tone="brand">Not logged</Badge>}
            />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Section className="lg:col-span-3" title="Last 6 months" description="Earned, spent and invested each month">
          <TrendChart data={data.trend} />
        </Section>
        <Section className="lg:col-span-2" title="How you paid" description="UPI, card and cash this month">
          {data.byMode.length ? (
            <Donut data={data.byMode} colorFor={modeColor} centerLabel="Spent" />
          ) : (
            <Empty icon={Receipt} title="No spending yet" text="Expenses you add will show up here." />
          )}
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Section
          className="lg:col-span-3"
          title="Where it went"
          description="Spending by category"
          action={
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link to="/expenses">See all</Link>
            </Button>
          }
        >
          {data.byCategory.length ? (
            <BarList rows={foldOther(data.byCategory, 7)} onSelect={(r) => r.key !== 'Other' && navigate(`/expenses?category=${encodeURIComponent(r.key)}`)} />
          ) : (
            <Empty icon={Receipt} title="Nothing spent this month" />
          )}
        </Section>
        <Section
          className="lg:col-span-2"
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" /> Quick advice
            </span>
          }
          action={
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link to="/insights">Ask AI</Link>
            </Button>
          }
        >
          <RecommendationList items={data.advice.recommendations.slice(0, 3)} compact />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Section className="lg:col-span-3" title="Daily spending" description={monthLabel(month)}>
          {data.daily.length ? <DailyChart data={data.daily} /> : <Empty title="No expenses this month" />}
        </Section>
        <Section
          className="lg:col-span-2"
          bodyClassName="px-0 pb-2 sm:px-0 sm:pb-2"
          title="Recent"
          action={
            !viewingAll && (
              <Button variant="ghost" size="sm" onClick={openAddExpense}>
                <Plus /> Add
              </Button>
            )
          }
        >
          {recent.data?.length ? (
            <ul className="divide-y">
              {recent.data.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.merchant || e.description || e.category}</div>
                    <div className="text-xs text-muted-foreground">
                      {relativeDay(e.date)} · {e.payment_mode}
                      {viewingAll ? ` · ${e.user_name}` : ''}
                    </div>
                  </div>
                  <span className={cn('tabular text-sm font-semibold')}>{inr(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Receipt} title="No expenses yet" text="Tap + to log your first one." />
          )}
        </Section>
      </div>
    </>
  );
}
