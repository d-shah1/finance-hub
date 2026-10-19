import { useEffect, useState } from 'react';
import { Bell, BellOff, KeyRound, Moon, Smartphone, Sun, User } from 'lucide-react';
import { useApp } from '@/context';
import { api } from '@/lib/api';
import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ErrorText, Field, IconTile, PageHeader, Section, toast } from '@/components/common';

function Heading({ icon, title }) {
  return (
    <span className="flex items-center gap-3">
      <IconTile icon={icon} />
      {title}
    </span>
  );
}

export default function Settings() {
  const { user, setUser, dark, toggleTheme, meta } = useApp();
  const fixedTimes = meta?.fixedReminderTimes;
  const [profile, setProfile] = useState({ name: user.name, monthly_budget: user.monthly_budget ?? '', reminder_time: user.reminder_time, reminders_enabled: user.reminders_enabled });
  const [pushOn, setPushOn] = useState(false);
  const [pushError, setPushError] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    currentSubscription()
      .then((s) => setPushOn(!!s))
      .catch(() => {});
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
        <Section
          title={<Heading icon={Bell} title="Reminders" />}
          description="A notification every evening to log the day's spending, plus one the day before each credit card bill and SIP."
        >
          <form onSubmit={saveProfile} className="space-y-5">
            <div className="flex items-center gap-3">
              <Switch id="rem-on" checked={profile.reminders_enabled} onCheckedChange={(c) => setProfile({ ...profile, reminders_enabled: c })} />
              <Label htmlFor="rem-on">Send me reminders</Label>
            </div>
            {fixedTimes ? (
              <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                Every evening at about <strong className="text-foreground">9 PM</strong>, and at about <strong className="text-foreground">9 AM</strong> the day before each card bill and SIP.
              </p>
            ) : (
              <Field label="Daily reminder time" htmlFor="rem-time" hint="Card bill and SIP reminders arrive at 9 AM the day before they're due.">
                <Input id="rem-time" className="sm:max-w-[12rem]" type="time" value={profile.reminder_time} onChange={(e) => setProfile({ ...profile, reminder_time: e.target.value })} />
              </Field>
            )}
            <Button type="submit">Save reminder settings</Button>
          </form>
          <Separator className="my-5" />
          <div className="flex flex-wrap items-center gap-3">
            {pushOn ? <Bell className="h-[18px] w-[18px] text-emerald-500" /> : <BellOff className="h-[18px] w-[18px] text-muted-foreground" />}
            <div className="flex-1 text-sm">
              <div className="font-medium">Notifications on this device</div>
              <div className="text-xs text-muted-foreground">{pushOn ? 'On' : 'Off'} · turn on for each phone or computer you use</div>
            </div>
            <Button variant={pushOn ? 'outline' : 'default'} onClick={togglePush} disabled={!pushSupported() && !pushOn}>
              {pushOn ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
          {isIos && !standalone && (
            <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5 shrink-0" /> On iPhone: tap Share → “Add to Home Screen”, open the app from there, then turn notifications on.
            </p>
          )}
          <div className="mt-3">
            <ErrorText error={pushError} />
          </div>
        </Section>

        <Section title={<Heading icon={User} title="Profile & budget" />}>
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Display name" htmlFor="pf-name">
              <Input id="pf-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Monthly spending budget (₹)" htmlFor="pf-budget" hint="Optional. Shown on your dashboard and used by the advisor.">
              <Input id="pf-budget" type="number" min="0" inputMode="decimal" value={profile.monthly_budget} onChange={(e) => setProfile({ ...profile, monthly_budget: e.target.value })} />
            </Field>
            <Button type="submit">Save profile</Button>
          </form>
          <Separator className="my-5" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Appearance</span>
            <Button variant="outline" onClick={toggleTheme}>
              {dark ? <Sun /> : <Moon />} {dark ? 'Light mode' : 'Dark mode'}
            </Button>
          </div>
        </Section>

        <Section title={<Heading icon={KeyRound} title="Change password" />}>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password" htmlFor="pw-cur">
              <Input id="pw-cur" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 6 characters">
              <Input id="pw-new" type="password" autoComplete="new-password" required minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <ErrorText error={pwError} />
            <Button type="submit">Update password</Button>
          </form>
        </Section>
      </div>
    </>
  );
}
