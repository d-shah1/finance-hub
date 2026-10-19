import { useState } from 'react';
import { ArrowRight, CreditCard, PiggyBank, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorText, Field } from '@/components/common';

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
          <span className="text-lg font-semibold">Finance Hub</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Every rupee, accounted for.</h1>
          <p className="mt-4 text-white/80">Log spends in seconds, never miss a card bill, and let a free AI tell you how much to invest each month.</p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              [CreditCard, 'UPI, card and cash spending with bill reminders'],
              [PiggyBank, 'SIPs, investments and your stock portfolio in one place'],
              [Sparkles, 'Personal AI advice on saving and investing'],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Private to Darsh, Bhakti and the admin.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <img src="/icon.svg" alt="" className="mb-2 h-11 w-11 rounded-xl lg:hidden" />
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your Finance Hub</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Username" htmlFor="login-user">
                <Input id="login-user" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="login-pass">
                <Input id="login-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <ErrorText error={error} />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'} <ArrowRight />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
