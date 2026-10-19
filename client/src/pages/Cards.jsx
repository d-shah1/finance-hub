import { useState } from 'react';
import { CalendarCheck, CheckCircle2, CreditCard, Plus, Settings2, Undo2 } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { api } from '@/lib/api';
import { inr, niceDate, pct, todayIso } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge, Empty, ErrorText, Field, Loading, Modal, PageHeader, Section, toast } from '@/components/common';
import EntityForm from '@/components/EntityForm';

const COLORS = ['#2a78d6', '#6250d6', '#1baf7a', '#eb6834', '#e34948', '#0f172a', '#b45309', '#db2777'];

export function CardStatusBadge({ status, days }) {
  if (status === 'paid')
    return (
      <Badge tone="good">
        <CheckCircle2 /> Paid
      </Badge>
    );
  if (status === 'overdue') return <Badge tone="critical">Overdue {Math.abs(days)}d</Badge>;
  if (status === 'due-soon') return <Badge tone="warning">{days === 0 ? 'Due today' : `Due in ${days}d`}</Badge>;
  return <Badge>In {days} days</Badge>;
}

function PayModal({ card, onClose }) {
  const { refresh } = useApp();
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [error, setError] = useState(null);
  const suggested = card ? Math.max(0, card.billed_amount - card.paid_amount) : 0;

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/card-payments', { method: 'POST', body: { card_id: card.id, due_date: card.cycle.due_date, amount: amount === '' ? suggested : amount, paid_on: paidOn } });
      toast('Payment recorded');
      setAmount('');
      refresh();
      onClose();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      title={`Pay ${card?.name || ''} bill`}
      description={card ? `Statement ${niceDate(card.cycle.billed_from)} – ${niceDate(card.cycle.billed_to)}, due ${niceDate(card.cycle.due_date, { day: 'numeric', month: 'long' })}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="pay-form" type="submit">
            Mark as paid
          </Button>
        </>
      }
    >
      {card && (
        <form id="pay-form" onSubmit={submit} className="space-y-4">
          <Field label="Amount paid (₹)" htmlFor="pay-amount" hint={`Tracked spend on this statement: ${inr(card.billed_amount)}. Enter the amount on your bank statement if different.`}>
            <Input id="pay-amount" type="number" step="any" min="0" inputMode="decimal" placeholder={String(Math.round(suggested))} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Paid on" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <ErrorText error={error} />
        </form>
      )}
    </Modal>
  );
}

export default function Cards() {
  const { viewingAll, refresh } = useApp();
  const { data, loading } = useApi('/cards/overview');
  const payments = useApi('/card-payments', { limit: 20 });
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);

  const fields = [
    { name: 'name', label: 'Card name', required: true, placeholder: 'e.g. HDFC Millennia', span: 2 },
    { name: 'bank', label: 'Bank' },
    { name: 'last4', label: 'Last 4 digits', placeholder: '1234' },
    { name: 'statement_day', label: 'Statement date (day of month)', type: 'number', required: true, min: 1, max: 31, hint: 'The day your bill is generated' },
    { name: 'due_day', label: 'Payment due date (day of month)', type: 'number', required: true, min: 1, max: 31, hint: 'The day payment must reach the bank' },
    { name: 'credit_limit', label: 'Credit limit (₹)', type: 'number', min: 0 },
    { name: 'color', label: 'Colour', type: 'color', options: COLORS },
    { name: 'active', label: 'Active card', type: 'toggle' },
    { name: 'notes', label: 'Notes', span: 2 },
  ];

  const cardNames = Object.fromEntries((data || []).map((c) => [c.id, c.name]));
  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus /> Add card
    </Button>
  );

  return (
    <>
      <PageHeader title="Credit cards" subtitle="Bills, due dates and how much you've spent on each card" actions={!viewingAll && addButton} />
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Card>
          <Empty
            icon={CreditCard}
            title="No cards yet"
            text="Add your credit cards with their statement and due dates. You'll get a reminder the day before each bill is due."
            action={!viewingAll && addButton}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="relative overflow-hidden p-5 text-white" style={{ background: `linear-gradient(135deg, ${c.color || '#2a78d6'}, ${c.color || '#2a78d6'}cc 60%, #0f172a)` }}>
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
                <div className="absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-white/5" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-white/70">{c.bank || 'Credit card'}</div>
                    <div className="text-lg font-semibold">{c.name}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setEditing(c)} aria-label="Edit card">
                    <Settings2 />
                  </Button>
                </div>
                <div className="relative mt-6 flex items-end justify-between">
                  <div className="font-mono text-sm tracking-widest text-white/80">•••• {c.last4 || '••••'}</div>
                  {viewingAll && <div className="text-xs text-white/70">{c.user_name}</div>}
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Current bill · due {niceDate(c.cycle.due_date, { day: 'numeric', month: 'short' })}</div>
                    <div className="text-2xl font-semibold tracking-tight">{inr(c.billed_amount)}</div>
                  </div>
                  <CardStatusBadge status={c.status} days={c.cycle.days_to_due} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted p-3">
                    <div className="text-xs text-muted-foreground">Unbilled so far</div>
                    <div className="font-semibold">{inr(c.unbilled_amount)}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <div className="text-xs text-muted-foreground">Next statement</div>
                    <div className="font-semibold">{niceDate(c.cycle.next_statement)}</div>
                  </div>
                </div>
                {c.utilisation !== null && (
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">Limit used</span>
                      <span className={c.utilisation > 0.3 ? 'font-semibold text-amber-600' : 'text-muted-foreground'}>
                        {pct(c.utilisation)} of {inr(c.credit_limit)}
                      </span>
                    </div>
                    <Progress
                      value={c.utilisation * 100}
                      className="bg-muted"
                      indicatorClassName={c.utilisation > 0.3 ? 'bg-amber-500' : 'bg-emerald-500'}
                      aria-label="Credit limit used"
                    />
                  </div>
                )}
                {c.status === 'paid' ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <CalendarCheck className="h-4 w-4" /> Paid {inr(c.paid_amount)} on {niceDate(c.payments[0].paid_on)}
                  </p>
                ) : (
                  <Button className="w-full" onClick={() => setPaying(c)}>
                    Mark bill as paid
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {payments.data?.length > 0 && (
        <Section className="mt-6" title="Payment history" bodyClassName="px-0 pb-1 sm:px-0 sm:pb-1">
          <ul className="divide-y">
            {payments.data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{cardNames[p.card_id] || 'Card'}</div>
                  <div className="text-xs text-muted-foreground">
                    Paid {niceDate(p.paid_on)} for bill due {niceDate(p.due_date)}
                    {viewingAll ? ` · ${p.user_name}` : ''}
                  </div>
                </div>
                <span className="tabular font-semibold">{inr(p.amount)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label="Undo payment"
                  title="Undo payment"
                  onClick={async () => {
                    await api(`/card-payments/${p.id}`, { method: 'DELETE' });
                    toast('Payment removed');
                    refresh();
                  }}
                >
                  <Undo2 />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <EntityForm
        open={adding || !!editing}
        record={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/cards"
        noun="Card"
        fields={fields}
        initial={{ statement_day: 1, due_day: 20, color: COLORS[0], active: 1 }}
      />
      <PayModal card={paying} onClose={() => setPaying(null)} />
    </>
  );
}
