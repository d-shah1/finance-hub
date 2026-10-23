import { useRef, useState } from 'react';
import { ChevronRight, Landmark, Plus, RotateCcw } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { api } from '@/lib/api';
import { inr, niceDate, todayIso } from '@/lib/format';
import { fdPreview } from '@/lib/fd';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge, Empty, ErrorText, Field, Loading, Modal, toast } from '@/components/common';
import EntityForm from '@/components/EntityForm';
import { accountField } from '@/hooks/useAccountOptions';

const fullDate = (iso) => niceDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const COMPOUNDING = [
  { value: 'quarterly', label: 'Quarterly (most banks)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'half-yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'simple', label: 'Simple interest' },
];
const PAYOUT = [
  { value: 'cumulative', label: 'At maturity (cumulative)' },
  { value: 'monthly', label: 'Paid out monthly' },
  { value: 'quarterly', label: 'Paid out quarterly' },
];
const payoutLabel = (p) => PAYOUT.find((x) => x.value === p)?.label || p;
const compoundingLabel = (c) => COMPOUNDING.find((x) => x.value === c)?.label.replace(' (most banks)', '') || c;

function tenureText(fd) {
  const parts = [];
  if (fd.tenure_months) parts.push(plural(fd.tenure_months, 'month'));
  if (fd.tenure_days) parts.push(plural(fd.tenure_days, 'day'));
  return parts.join(' ') || plural(fd.tenure_days, 'day');
}

function StatusBadge({ fd }) {
  if (fd.status === 'matured') return <Badge tone="warning">Matured</Badge>;
  if (fd.status === 'closed') return <Badge>{fd.close_type === 'renewed' ? 'Renewed' : 'Withdrawn'}</Badge>;
  if (fd.days_left <= 30) return <Badge tone="brand">{fd.days_left === 0 ? 'Matures today' : `${plural(fd.days_left, 'day')} left`}</Badge>;
  return null;
}

function FdRow({ fd, viewingAll, onOpen }) {
  const done = fd.status === 'closed';
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', done ? 'bg-muted text-muted-foreground' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300')}>
          <Landmark className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('flex min-w-0 items-center gap-2 font-medium', done && 'text-muted-foreground')}>
              <span className="truncate">
                {fd.bank}
                {fd.name ? ` · ${fd.name}` : ''}
              </span>
              <StatusBadge fd={fd} />
            </span>
            <span className="tabular shrink-0 font-semibold">{inr(fd.value_today)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {inr(fd.principal)} at {fd.rate}% · {fd.status === 'active' ? `matures ${fullDate(fd.maturity_date)}` : fd.status === 'matured' ? `matured ${fullDate(fd.maturity_date)}` : `closed ${fullDate(fd.closed_on)}`}
              {viewingAll ? ` · ${fd.user_name}` : ''}
            </span>
            {fd.status === 'active' && <span className="tabular shrink-0 text-emerald-600 dark:text-emerald-400">+{inr(fd.interest_so_far)}</span>}
          </div>
          {fd.status === 'active' && <Progress value={fd.progress * 100} className="h-1 bg-muted" indicatorClassName="bg-emerald-500" aria-label="Time to maturity" />}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/** Small drawer for renewing or closing: a couple of fields and a confirm button. */
function ActionForm({ action, fd, onClose, onDone }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = !!action;
  const renew = action === 'renew';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = renew
        ? { rate: form.rate ?? fd.rate, tenure_months: form.tenure_months ?? fd.tenure_months, tenure_days: form.tenure_days ?? fd.tenure_days }
        : { closed_on: form.closed_on || (fd.status === 'matured' ? fd.maturity_date : todayIso()), close_amount: form.close_amount === '' || form.close_amount === undefined ? undefined : form.close_amount };
      await api(`/fds/${fd.id}/${renew ? 'renew' : 'close'}`, { method: 'POST', body });
      toast(renew ? 'FD renewed' : 'FD closed');
      setForm({});
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const matured = fd?.status === 'matured';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={renew ? 'Renew FD' : matured ? 'Mark as withdrawn' : 'Close FD early'}
      description={
        fd &&
        (renew
          ? `The maturity amount of ${inr(fd.maturity_amount)} goes into a new FD starting ${fullDate(fd.maturity_date)}.`
          : matured
            ? 'Record that you took the money out. It counts as paid into the linked bank account on that day.'
            : 'Breaking an FD early usually earns a lower rate. Enter what the bank actually paid if you know it.')
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="fd-action" disabled={busy}>
            {renew ? 'Renew' : 'Save'}
          </Button>
        </>
      }
    >
      {fd && (
        <form id="fd-action" onSubmit={submit} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {renew ? (
            <>
              <Field label="New interest rate (%)" htmlFor="fa-rate" className="sm:col-span-2">
                <Input id="fa-rate" type="number" step="0.01" min="0" inputMode="decimal" placeholder={String(fd.rate)} value={form.rate ?? ''} onChange={(e) => setForm({ ...form, rate: e.target.value || undefined })} />
              </Field>
              <Field label="Months" htmlFor="fa-m">
                <Input id="fa-m" type="number" min="0" inputMode="numeric" placeholder={String(fd.tenure_months)} value={form.tenure_months ?? ''} onChange={(e) => setForm({ ...form, tenure_months: e.target.value || undefined })} />
              </Field>
              <Field label="Days" htmlFor="fa-d">
                <Input id="fa-d" type="number" min="0" inputMode="numeric" placeholder={String(fd.tenure_days)} value={form.tenure_days ?? ''} onChange={(e) => setForm({ ...form, tenure_days: e.target.value || undefined })} />
              </Field>
            </>
          ) : (
            <>
              <Field label={matured ? 'Withdrawn on' : 'Closed on'} htmlFor="fa-on">
                <Input id="fa-on" type="date" max={todayIso()} value={form.closed_on ?? (matured ? fd.maturity_date : todayIso())} onChange={(e) => setForm({ ...form, closed_on: e.target.value })} />
              </Field>
              <Field label="Amount received (₹)" htmlFor="fa-amt" hint={matured ? null : `Estimated ${inr(fd.value_today)} before any penalty`}>
                <Input
                  id="fa-amt"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  placeholder={String(Math.round(matured ? fd.maturity_amount : fd.value_today))}
                  value={form.close_amount ?? ''}
                  onChange={(e) => setForm({ ...form, close_amount: e.target.value })}
                />
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <ErrorText error={error} />
          </div>
        </form>
      )}
    </Modal>
  );
}

function Row({ label, children }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function FdDetail({ fd, ...props }) {
  const last = useRef(fd);
  if (fd) last.current = fd;
  if (!last.current) return null;
  return <FdDetailBody fd={last.current} open={!!fd} {...props} />;
}

function FdDetailBody({ fd, open, accounts, onClose, onEdit, onAction }) {
  const { refresh } = useApp();
  const account = accounts.find((a) => a.value === fd.bank_account_id)?.label;
  const cumulative = fd.payout === 'cumulative';

  async function reopen() {
    await api(`/fds/${fd.id}/reopen`, { method: 'POST' });
    toast('FD reopened');
    refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${fd.bank}${fd.name ? ` · ${fd.name}` : ''}`}
      description={`${fd.rate}% · ${tenureText(fd)} · ${payoutLabel(fd.payout).toLowerCase()}`}
      footer={
        fd.status === 'closed' ? (
          <Button variant="outline" onClick={reopen}>
            <RotateCcw /> {fd.close_type === 'renewed' ? 'Undo renewal' : 'Reopen'}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => onAction('close')}>
              {fd.status === 'matured' ? 'Mark withdrawn' : 'Close early'}
            </Button>
            <Button variant="outline" onClick={() => onAction('renew')}>
              Renew
            </Button>
            <div className="hidden flex-1 sm:block" />
            <Button onClick={onEdit}>Edit FD</Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {fd.status === 'matured' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            Matured on {fullDate(fd.maturity_date)}. Renew it, or mark it withdrawn. Until then it is treated as paid out{account ? ` to ${account}` : ''}.
          </p>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">{fd.status === 'active' ? 'Value today' : fd.status === 'closed' ? 'Amount received' : 'Maturity amount'}</div>
            <div className="text-2xl font-semibold tracking-tight">{inr(fd.value_today)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Invested</div>
            <div className="font-semibold">{inr(fd.principal)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{cumulative ? 'Interest so far' : 'Interest paid out so far'}</div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400">+{inr(fd.interest_so_far)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">At maturity</div>
            <div className="font-semibold">{inr(fd.maturity_amount)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total interest</div>
            <div className="font-semibold">{inr(fd.total_interest)}</div>
          </div>
        </div>

        {fd.status === 'active' && (
          <div className="space-y-1.5">
            <Progress value={fd.progress * 100} className="h-1.5 bg-muted" indicatorClassName="bg-emerald-500" aria-label="Time to maturity" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{fullDate(fd.start_date)}</span>
              <span>{plural(fd.days_left, 'day')} left</span>
              <span>{fullDate(fd.maturity_date)}</span>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-lg border p-3 text-sm">
          <Row label="Rate">
            {fd.rate}% a year, {compoundingLabel(fd.compounding).toLowerCase()}
          </Row>
          <Row label="Tenure">
            {tenureText(fd)} · {fullDate(fd.start_date)} – {fullDate(fd.maturity_date)}
          </Row>
          <Row label="Interest">{payoutLabel(fd.payout)}</Row>
          {account && <Row label="Account">{account}</Row>}
          <Row label="On maturity">{fd.auto_renew ? 'Renews automatically' : 'Paid out'}</Row>
          {fd.fd_number && <Row label="FD number">{fd.fd_number}</Row>}
          {fd.notes && <Row label="Notes">{fd.notes}</Row>}
        </dl>
        <p className="text-xs text-muted-foreground">Interest is estimated the way most Indian banks calculate it and may differ from your FD receipt by a few rupees. TDS is not deducted.</p>
      </div>
    </Modal>
  );
}

function FdPreview({ form }) {
  const p = fdPreview(form);
  if (!p) return null;
  if (p.tooShort) return <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">An FD must run for at least 7 days.</p>;
  return (
    <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
      Matures {fullDate(p.maturity)} ·{' '}
      {p.payout ? `${inr(p.interest)} interest paid out over the term` : `${inr(p.amount)} (${inr(p.interest)} interest)`}
    </p>
  );
}

function fdFields(accountOptions) {
  return [
    { section: 'Deposit', name: 'bank', label: 'Bank', required: true, placeholder: 'e.g. SBI, HDFC Bank' },
    { section: 'Deposit', name: 'name', label: 'Label', placeholder: 'e.g. Emergency fund' },
    { section: 'Deposit', name: 'principal', label: 'Amount (₹)', type: 'number', required: true, min: 1 },
    { section: 'Deposit', name: 'rate', label: 'Interest rate (% a year)', type: 'number', required: true, min: 0, max: 20, step: '0.01' },
    { section: 'Tenure', name: 'start_date', label: 'Start date', type: 'date', required: true, max: todayIso(), span: 2 },
    { section: 'Tenure', name: 'tenure_months', label: 'Months', type: 'number', min: 0, max: 240 },
    { section: 'Tenure', name: 'tenure_days', label: 'Days', type: 'number', min: 0, max: 365 },
    { section: 'Interest', name: 'compounding', label: 'Compounding', type: 'select', required: true, options: COMPOUNDING },
    { section: 'Interest', name: 'payout', label: 'Interest paid', type: 'select', required: true, options: PAYOUT },
    { section: 'Money', name: 'bank_account_id', ...accountField(accountOptions, 'Paid from / back to'), hint: null },
    { section: 'Money', name: 'auto_renew', label: 'Renew automatically at maturity', type: 'toggle' },
    { section: 'Money', name: 'fd_number', label: 'FD / receipt number', more: true },
    { section: 'Money', name: 'notes', label: 'Notes', span: 2, more: true },
  ];
}

export default function FixedDeposits({ viewingAll, accountOptions }) {
  const { refresh } = useApp();
  const { data, loading } = useApi('/fds/overview');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [action, setAction] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const fds = data || [];
  const open = fds.find((f) => f.id === openId) || null;
  const running = fds.filter((f) => f.status === 'active');
  const matured = fds.filter((f) => f.status === 'matured');
  const closed = fds.filter((f) => f.status === 'closed');
  const invested = running.reduce((t, f) => t + f.principal, 0);
  const value = running.reduce((t, f) => t + f.value_today, 0);
  const next = running[0];

  const addButton = (
    <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
      <Plus /> Add FD
    </Button>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <h2 className="font-semibold">Fixed deposits</h2>
          <p className="text-xs text-muted-foreground">
            {running.length
              ? `${inr(invested)} in ${plural(running.length, 'FD')} · worth ${inr(value)} today${next ? ` · next matures ${niceDate(next.maturity_date)}` : ''}`
              : 'Track your FDs, their interest and maturity dates'}
          </p>
        </div>
        {!viewingAll && addButton}
      </div>
      {loading && !data ? (
        <Loading />
      ) : !fds.length ? (
        <Empty icon={Landmark} title="No fixed deposits" text="Add an FD with its rate and tenure to see what it is worth today, when it matures and how much interest it earns." />
      ) : (
        <>
          <ul className="divide-y border-t">
            {[...matured, ...running].map((f) => (
              <FdRow key={f.id} fd={f} viewingAll={viewingAll} onOpen={() => setOpenId(f.id)} />
            ))}
          </ul>
          {closed.length > 0 && (
            <div className="border-t">
              <button className="w-full px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 sm:px-5" onClick={() => setShowClosed((v) => !v)}>
                {showClosed ? 'Hide' : 'Show'} {plural(closed.length, 'closed FD')}
              </button>
              {showClosed && (
                <ul className="divide-y border-t">
                  {closed.map((f) => (
                    <FdRow key={f.id} fd={f} viewingAll={viewingAll} onOpen={() => setOpenId(f.id)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <FdDetail
        fd={action ? null : open}
        accounts={accountOptions}
        onClose={() => setOpenId(null)}
        onEdit={() => {
          setEditing(open);
          setOpenId(null);
        }}
        onAction={setAction}
      />
      <ActionForm
        action={action}
        fd={open}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          setOpenId(null);
          refresh();
        }}
      />
      <EntityForm
        open={adding || !!editing}
        record={editing}
        title={editing ? `Edit ${editing.bank} FD` : 'Add fixed deposit'}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/fds"
        noun="FD"
        fields={fdFields(accountOptions)}
        initial={() => ({ start_date: todayIso(), tenure_months: 12, tenure_days: 0, compounding: 'quarterly', payout: 'cumulative', auto_renew: 0 })}
        extra={(form) => <FdPreview form={form} />}
      />
    </Card>
  );
}
