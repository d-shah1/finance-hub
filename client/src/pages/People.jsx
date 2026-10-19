import { useState } from 'react';
import { KeyRound, Plus, Shield, Trash2 } from 'lucide-react';
import { useApp } from '@/context';
import { api } from '@/lib/api';
import { niceDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge, ErrorText, Field, Modal, PageHeader, toast } from '@/components/common';

const BLANK = { username: '', name: '', password: '', role: 'user' };

export default function People() {
  const { people, setPeople, user, setViewing } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [resetFor, setResetFor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState(null);

  const reload = () => api('/users').then(setPeople);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api('/users', { method: 'POST', body: form });
      toast('Person added');
      setAdding(false);
      setForm(BLANK);
      reload();
    } catch (err) {
      setError(err);
    }
  }

  async function reset(e) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/users/${resetFor.id}/password`, { method: 'POST', body: { password: newPw } });
      toast(`Password reset for ${resetFor.name}`);
      setResetFor(null);
      setNewPw('');
    } catch (err) {
      setError(err);
    }
  }

  async function remove() {
    await api(`/users/${deleting.id}`, { method: 'DELETE' });
    toast(`${deleting.name} removed`);
    setDeleting(null);
    reload();
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone who can sign in. As admin you can see all of their data."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add person
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-gradient-to-br from-brand-400 to-violet-500 font-semibold text-white">{p.name[0]}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">@{p.username}</div>
              </div>
              {p.role === 'admin' ? (
                <Badge tone="brand">
                  <Shield /> Admin
                </Badge>
              ) : (
                <Badge>Member</Badge>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted p-2.5">
                <dt className="text-xs text-muted-foreground">Expenses logged</dt>
                <dd className="font-semibold">{p.expenses}</dd>
              </div>
              <div className="rounded-lg bg-muted p-2.5">
                <dt className="text-xs text-muted-foreground">Last entry</dt>
                <dd className="font-semibold">{p.last_expense ? niceDate(p.last_expense) : '—'}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.role !== 'admin' && (
                <Button variant="outline" size="sm" onClick={() => setViewing(String(p.id))}>
                  View their data
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setResetFor(p)}>
                <KeyRound /> Reset password
              </Button>
              {p.id !== user.id && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(p)}>
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add person"
        footer={
          <Button form="add-person" type="submit">
            Create account
          </Button>
        }
      >
        <form id="add-person" onSubmit={add} className="space-y-4">
          <Field label="Name" htmlFor="np-name">
            <Input id="np-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Username" htmlFor="np-user">
            <Input id="np-user" required autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Password" htmlFor="np-pass" hint="They can change it in Settings">
            <Input id="np-pass" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Member (sees only their own data)</SelectItem>
                <SelectItem value="admin">Admin (sees everything)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ErrorText error={error} />
        </form>
      </Modal>

      <Modal
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        title={`Reset password for ${resetFor?.name}`}
        footer={
          <Button form="reset-pw" type="submit">
            Reset
          </Button>
        }
      >
        <form id="reset-pw" onSubmit={reset} className="space-y-4">
          <Field label="New password" htmlFor="rp-pass">
            <Input id="rp-pass" required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </Field>
          <ErrorText error={error} />
        </form>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This removes the account and all of their expenses, earnings, investments and cards. It cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete everything
            </Button>
          </>
        }
      />
    </>
  );
}
