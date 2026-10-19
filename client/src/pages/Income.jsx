import { useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { inr, niceDate, todayIso } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge, Empty, IconTile, Loading, PageHeader, Section } from '@/components/common';
import { BarList, TrendChart } from '@/components/charts';
import EntityForm from '@/components/EntityForm';

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
  const byType = Object.entries((data || []).reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + r.amount }), {}))
    .map(([key, t]) => ({ key, total: t }))
    .sort((a, b) => b.total - a.total);

  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus /> Add earning
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle="Salary, freelance and every other rupee coming in"
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            {!viewingAll && addButton}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <span className="text-sm font-medium text-muted-foreground">Total earned</span>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{inr(total)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{data?.length || 0} entries</div>
          {byType.length > 0 && (
            <div className="mt-5">
              <BarList rows={byType} />
            </div>
          )}
        </Card>
        <Section className="lg:col-span-2" title="Earned vs spent" description="Last 6 months">
          {summary.data && <TrendChart data={summary.data.trend} height={240} />}
        </Section>
      </div>

      <Card className="mt-4 overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty icon={Wallet} title="No earnings recorded" text="Add your salary and other income so the AI advisor can work out how much to invest." action={!viewingAll && addButton} />
        ) : (
          <ul className="divide-y">
            {data.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5" onClick={() => setEditing(r)}>
                  <IconTile icon={Wallet} tone="good" className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.source}</div>
                    <div className="text-xs text-muted-foreground">
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
      </Card>

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
