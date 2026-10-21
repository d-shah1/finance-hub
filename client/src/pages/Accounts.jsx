import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Landmark, PencilLine, Plus, Settings2 } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { api } from '@/lib/api';
import { inr, niceDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, Empty, ErrorText, Field, Loading, Modal, PageHeader, toast } from '@/components/common';
import EntityForm from '@/components/EntityForm';

const COLORS = ['#1baf7a', '#2a78d6', '#6250d6', '#eb6834', '#e34948', '#0f172a', '#b45309', '#db2777'];

/** "Entered on" date for the balance, in the viewer's local time. */
function enteredOn(a) {
  const d = new Date(`${a.balance_set_at.replace(' ', 'T')}Z`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function UpdateBalance({ account, onClose }) {
  const { refresh } = useApp();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/accounts/${account.id}`, { method: 'PUT', body: { balance: value === '' ? account.current_balance : value } });
      toast('Balance updated');
      setValue('');
      refresh();
      onClose();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={`Update ${account?.name || ''} balance`}
      description="Enter the balance shown in your bank app right now. Later expenses, investments and earnings linked to this account adjust it from there."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="balance-form" type="submit">
            Save balance
          </Button>
        </>
      }
    >
      {account && (
        <form id="balance-form" onSubmit={save} className="space-y-4">
          <Field label="Current balance (₹)" htmlFor="bal-value" hint={`The app currently shows ${inr(account.current_balance, true)}.`}>
            <Input
              id="bal-value"
              className="h-11 text-lg font-semibold"
              type="number"
              step="any"
              inputMode="decimal"
              autoFocus
              placeholder={String(Math.round(account.current_balance))}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
        </form>
      )}
    </Modal>
  );
}

export default function Accounts() {
  const { meta, viewingAll } = useApp();
  const { data, loading } = useApi('/accounts/overview');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState(null);

  const fields = [
    { name: 'name', label: 'Account name', required: true, placeholder: 'e.g. HDFC Savings', span: 2 },
    { name: 'bank', label: 'Bank', placeholder: 'HDFC Bank, SBI, ICICI…' },
    { name: 'last4', label: 'Last 4 digits', placeholder: '1234' },
    { name: 'account_type', label: 'Type', type: 'segmented', options: meta?.accountTypes || ['Savings'] },
    {
      name: 'balance',
      label: editing ? 'Current balance (₹)' : 'Balance right now (₹)',
      type: 'number',
      required: true,
      hint: 'As shown in your bank app. Linked transactions adjust it from here.',
    },
    { name: 'color', label: 'Colour', type: 'color', options: COLORS },
    { name: 'active', label: 'Active account', type: 'toggle' },
    { name: 'notes', label: 'Notes', span: 2 },
  ];

  const active = (data || []).filter((a) => a.active);
  const total = active.reduce((s, a) => s + a.current_balance, 0);
  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus /> Add account
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Bank accounts"
        subtitle={active.length ? `${inr(total)} across ${active.length} account${active.length === 1 ? '' : 's'}` : 'Your savings and salary accounts'}
        actions={!viewingAll && addButton}
      />

      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Card>
          <Empty
            icon={Landmark}
            title="No bank accounts yet"
            text="Add your accounts with today's balance. Pick the account when you log a UPI or debit-card expense, an investment or an earning, and the balance keeps itself up to date."
            action={!viewingAll && addButton}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => {
            const moved = a.since.count > 0;
            return (
              <Card key={a.id} className={cn('overflow-hidden', !a.active && 'opacity-60')}>
                <div className="h-1.5" style={{ background: a.color || COLORS[0] }} />
                <div className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: a.color || COLORS[0] }}>
                      <Landmark className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[a.bank, a.last4 && `••${a.last4}`, viewingAll && a.user_name].filter(Boolean).join(' · ') || a.account_type}
                      </div>
                    </div>
                    <Badge>{a.active ? a.account_type : 'Inactive'}</Badge>
                    <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 text-muted-foreground" onClick={() => setEditing({ ...a, balance: a.current_balance })} aria-label="Edit account">
                      <Settings2 />
                    </Button>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className={cn('text-2xl font-semibold tracking-tight', a.current_balance < 0 && 'text-destructive')}>{inr(a.current_balance, true)}</div>
                  </div>

                  <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    {moved ? (
                      <>
                        <div>
                          You entered {inr(a.balance)} on {enteredOn(a)}. Since then:
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                          {a.since.spent > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <ArrowUpRight className="h-3.5 w-3.5" /> {inr(a.since.spent)} spent
                            </span>
                          )}
                          {a.since.invested > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <ArrowUpRight className="h-3.5 w-3.5" /> {inr(a.since.invested)} invested
                            </span>
                          )}
                          {a.since.received > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                              <ArrowDownLeft className="h-3.5 w-3.5" /> {inr(a.since.received)} received
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>Entered on {enteredOn(a)}. No linked transactions since.</>
                    )}
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => setUpdating(a)}>
                    <PencilLine /> Update balance
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data?.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          Balances change with the expenses, investments and earnings you link to an account. Credit card spends aren&apos;t taken off until you pay the bill. Update the balance now and then to
          match your bank app (e.g. for bank charges or interest).
        </p>
      )}

      <EntityForm
        open={adding || !!editing}
        record={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        endpoint="/accounts"
        noun="Account"
        fields={fields}
        initial={{ account_type: 'Savings', color: COLORS[0], active: 1 }}
      />
      <UpdateBalance account={updating} onClose={() => setUpdating(null)} />
    </>
  );
}
