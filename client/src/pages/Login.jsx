import { useState } from 'react';
import { ArrowRight, CreditCard, PiggyBank, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context';
import { ErrorText } from '../components/ui';

export default function Login() {
  const { setUser } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await api('/auth/login', { method: 'POST', body: { username, password } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-violet-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-violet-400/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl ring-2 ring-white/30" />
          <span className="text-lg font-bold">Finance Hub</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Every rupee, accounted for.</h1>
          <p className="mt-4 text-white/80">Log spends in seconds, never miss a card bill, and let a free AI tell you how much to invest each month.</p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              [CreditCard, 'UPI, card and cash spending with bill-due reminders'],
              [PiggyBank, 'SIPs, investments and your stock portfolio in one place'],
              [Sparkles, 'Personal AI advice on saving and investing'],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Private to Darsh, Bhakti and the admin.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <img src="/icon.svg" alt="" className="mb-4 h-12 w-12 rounded-2xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="muted mt-1 text-sm">Sign in to your Finance Hub</p>
          </div>
          <label className="block">
            <span className="label">Username</span>
            <input className="input" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <ErrorText error={error} />
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
