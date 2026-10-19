import { useState } from 'react';
import { KeyRound, Plus, Shield, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { niceDate } from '../lib/format';
import { Badge, ErrorText, Field, Modal, PageHeader, toast } from '../components/ui';

export default function People() {
  const { people, setPeople, user, setViewing } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'user' });
  const [resetFor, setResetFor] = useState(null);
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
      setForm({ username: '', name: '', password: '', role: 'user' });
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

  async function remove(p) {
    if (!window.confirm(`Delete ${p.name} and ALL their data? This cannot be undone.`)) return;
    await api(`/users/${p.id}`, { method: 'DELETE' });
    toast(`${p.name} removed`);
    reload();
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone who can sign in. As admin you can see all of their data."
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add person
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <div key={p.id} className="card card-pad">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-500 font-bold text-white">{p.name[0]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="muted text-xs">@{p.username}</div>
              </div>
              {p.role === 'admin' ? (
                <Badge tone="brand">
                  <Shield size={12} /> Admin
                </Badge>
              ) : (
                <Badge>Member</Badge>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-ink-850">
                <dt className="muted text-xs">Expenses logged</dt>
                <dd className="font-semibold">{p.expenses}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-ink-850">
                <dt className="muted text-xs">Last entry</dt>
                <dd className="font-semibold">{p.last_expense ? niceDate(p.last_expense) : '—'}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.role !== 'admin' && (
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setViewing(String(p.id))}>
                  View their data
                </button>
              )}
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setResetFor(p)}>
                <KeyRound size={14} /> Reset password
              </button>
              {p.id !== user.id && (
                <button className="btn-ghost px-3 py-1.5 text-xs text-red-600 dark:text-red-400" onClick={() => remove(p)}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add person"
        footer={
          <button form="add-person" className="btn-primary">
            Create account
          </button>
        }
      >
        <form id="add-person" onSubmit={add} className="space-y-4">
          <Field label="Name">
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Username">
            <input className="input" required autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Password" hint="They can change it in Settings">
            <input className="input" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Member (sees only their own data)</option>
              <option value="admin">Admin (sees everything)</option>
            </select>
          </Field>
          <ErrorText error={error} />
        </form>
      </Modal>

      <Modal
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        title={`Reset password for ${resetFor?.name}`}
        footer={
          <button form="reset-pw" className="btn-primary">
            Reset
          </button>
        }
      >
        <form id="reset-pw" onSubmit={reset} className="space-y-4">
          <Field label="New password">
            <input className="input" required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </Field>
          <ErrorText error={error} />
        </form>
      </Modal>
    </>
  );
}
