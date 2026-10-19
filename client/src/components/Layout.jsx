import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  BellRing, CreditCard, LayoutDashboard, LogOut, Menu, Moon, PiggyBank, Plus, Receipt, Settings, Sparkles, Sun, Users, Wallet, X,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { todayIso } from '../lib/format';
import ExpenseForm from './ExpenseForm';
import { Toaster } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/income', label: 'Earnings', icon: Wallet },
  { to: '/investments', label: 'Investments', icon: PiggyBank },
  { to: '/cards', label: 'Credit cards', icon: CreditCard },
  { to: '/insights', label: 'AI advisor', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight">Finance Hub</div>
        <div className="muted text-[11px]">Money, sorted</div>
      </div>
    </div>
  );
}

function ViewingSwitcher() {
  const { isAdmin, people, viewing, setViewing } = useApp();
  if (!isAdmin) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <Users size={16} className="muted" />
      <span className="muted hidden sm:inline">Viewing</span>
      <select className="input w-auto py-1.5 pr-8" value={viewing} onChange={(e) => setViewing(e.target.value)}>
        <option value="all">Everyone</option>
        {people.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shows a nudge after the user's reminder time if nothing was logged today, and a local notification as a fallback to push. */
function useDailyReminder(user, version) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!user || user.role === 'admin' || !user.reminders_enabled) return;
    let cancelled = false;
    async function check() {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm < user.reminder_time) return setDue(false);
      const rows = await api('/expenses', { params: { from: todayIso(), to: todayIso(), limit: 1 } }).catch(() => []);
      if (cancelled) return;
      const missing = rows.length === 0;
      setDue(missing);
      const key = `fh-local-reminder-${todayIso()}`;
      try {
        if (missing && Notification?.permission === 'granted' && !localStorage.getItem(key)) {
          localStorage.setItem(key, '1');
          const reg = await navigator.serviceWorker?.ready;
          reg?.showNotification("Log today's transactions", { body: "You haven't added any expenses today.", icon: '/icon-192.png', tag: 'daily-log' });
        }
      } catch {
        /* notifications unavailable */
      }
    }
    check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, version]);
  return due;
}

export default function Layout() {
  const { user, logout, dark, toggleTheme, isAdmin, version } = useApp();
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const reminderDue = useDailyReminder(user, version);

  // Notification taps open /expenses?new=1
  useEffect(() => {
    if (params.get('new') === '1') {
      setAdding(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const nav = isAdmin ? [...NAV.slice(0, -1), { to: '/people', label: 'People', icon: Users }, NAV.at(-1)] : NAV;

  const navLinks = (
    <nav className="space-y-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const userBlock = (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 p-2.5 dark:border-white/10">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-500 text-sm font-bold text-white">
        {user.name[0]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{user.name}</div>
        <div className="muted text-xs capitalize">{user.role}</div>
      </div>
      <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <button className="icon-btn" onClick={logout} aria-label="Sign out">
        <LogOut size={17} />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-black/5 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-ink-900/70 lg:flex">
        <Logo />
        <button className="btn-primary w-full" onClick={() => setAdding(true)}>
          <Plus size={18} /> Add expense
        </button>
        <div className="flex-1 overflow-y-auto">{navLinks}</div>
        {userBlock}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-white p-4 shadow-xl dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <Logo />
              <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navLinks}</div>
            {userBlock}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/5 bg-[#f6f7f9]/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-ink-950/80 sm:px-6 lg:px-8">
          <button className="icon-btn lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="flex-1" />
          <ViewingSwitcher />
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">
          {reminderDue && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <BellRing size={18} className="shrink-0" />
              <span className="flex-1 text-sm font-medium">You haven&apos;t logged any expenses today. Take 30 seconds to add them.</span>
              <button className="btn-primary py-1.5" onClick={() => setAdding(true)}>
                Log now
              </button>
            </div>
          )}
          <Outlet context={{ openAddExpense: () => setAdding(true) }} />
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-black/5 bg-white/90 pt-1.5 backdrop-blur dark:border-white/10 dark:bg-ink-900/90 lg:hidden">
        {[NAV[0], NAV[1], null, NAV[4], NAV[5]].map((item) =>
          item ? (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`
              }
            >
              <item.icon size={20} />
              {item.label.split(' ')[0]}
            </NavLink>
          ) : (
            <div key="add" className="flex justify-center">
              <button
                onClick={() => setAdding(true)}
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30 active:scale-95"
                aria-label="Add expense"
              >
                <Plus size={26} />
              </button>
            </div>
          )
        )}
      </nav>

      <ExpenseForm open={adding} onClose={() => setAdding(false)} />
      <Toaster />
    </div>
  );
}
