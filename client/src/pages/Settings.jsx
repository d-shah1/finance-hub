import { useEffect, useState } from 'react';
import { Bell, BellOff, KeyRound, Moon, Smartphone, Sun, User } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { ErrorText, Field, PageHeader, toast } from '../components/ui';

function Section({ icon: Icon, title, text, children }) {
  return (
    <section className="card card-pad">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {text && <p className="muted text-sm">{text}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { user, setUser, dark, toggleTheme } = useApp();
  const [profile, setProfile] = useState({ name: user.name, monthly_budget: user.monthly_budget ?? '', reminder_time: user.reminder_time, reminders_enabled: user.reminders_enabled });
  const [pushOn, setPushOn] = useState(false);
  const [pushError, setPushError] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    currentSubscription().then((s) => setPushOn(!!s)).catch(() => {});
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    try {
      setUser(await api('/me', { method: 'PUT', body: { ...profile, monthly_budget: profile.monthly_budget === '' ? null : profile.monthly_budget } }));
      toast('Settings saved');
    } catch (err) {
      toast(err.message, 'critical');
    }
  }

  async function togglePush() {
    setPushError(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast('Notifications turned off on this device');
      } else {
        await enablePush();
        setPushOn(true);
        await api('/push/test', { method: 'POST' });
        toast('Notifications on. A test one is on its way.');
      }
    } catch (err) {
      setPushError(err);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError(null);
    try {
      await api('/me/password', { method: 'POST', body: pw });
      setPw({ current: '', next: '' });
      toast('Password changed');
    } catch (err) {
      setPwError(err);
    }
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;

  return (
    <>
      <PageHeader title="Settings" subtitle={`Signed in as ${user.username}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={Bell} title="Reminders" text="A notification every evening to log the day's spending, plus one the day before each credit card bill and SIP.">
          <form onSubmit={saveProfile} className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={profile.reminders_enabled} onChange={(e) => setProfile({ ...profile, reminders_enabled: e.target.checked })} />
              <span className="text-sm font-medium">Send me reminders</span>
            </label>
            <Field label="Daily reminder time" hint="Card bill and SIP reminders arrive at 9 AM the day before they're due.">
              <input className="input sm:max-w-[12rem]" type="time" value={profile.reminder_time} onChange={(e) => setProfile({ ...profile, reminder_time: e.target.value })} />
            </Field>
            <button className="btn-primary">Save reminder settings</button>
          </form>
          <div className="mt-5 rounded-xl border border-black/5 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3">
              {pushOn ? <Bell size={18} className="text-emerald-500" /> : <BellOff size={18} className="muted" />}
              <div className="flex-1 text-sm">
                <div className="font-medium">Notifications on this device</div>
                <div className="muted text-xs">{pushOn ? 'On' : 'Off'} · turn on for each phone or computer you use</div>
              </div>
              <button className={pushOn ? 'btn-secondary' : 'btn-primary'} onClick={togglePush} disabled={!pushSupported() && !pushOn}>
                {pushOn ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            {isIos && !standalone && (
              <p className="muted mt-3 flex gap-2 text-xs">
                <Smartphone size={14} className="shrink-0" /> On iPhone: tap Share → “Add to Home Screen”, open the app from there, then turn notifications on.
              </p>
            )}
            <div className="mt-3">
              <ErrorText error={pushError} />
            </div>
          </div>
        </Section>

        <Section icon={User} title="Profile & budget">
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Display name">
              <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Monthly spending budget (₹)" hint="Optional. Shown on your dashboard and used by the advisor.">
              <input className="input" type="number" min="0" inputMode="decimal" value={profile.monthly_budget} onChange={(e) => setProfile({ ...profile, monthly_budget: e.target.value })} />
            </Field>
            <button className="btn-primary">Save profile</button>
          </form>
          <div className="mt-5 flex items-center justify-between rounded-xl border border-black/5 p-4 dark:border-white/10">
            <span className="text-sm font-medium">Appearance</span>
            <button className="btn-secondary" onClick={toggleTheme}>
              {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </Section>

        <Section icon={KeyRound} title="Change password">
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password">
              <input className="input" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="New password" hint="At least 6 characters">
              <input className="input" type="password" autoComplete="new-password" required minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <ErrorText error={pwError} />
            <button className="btn-primary">Update password</button>
          </form>
        </Section>
      </div>
    </>
  );
}
