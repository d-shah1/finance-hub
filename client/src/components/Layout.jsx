import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  BellRing, ChevronsUpDown, CreditCard, LayoutDashboard, LogOut, Menu, Moon, PiggyBank, Plus, Receipt, Settings, Sparkles, Sun, Users, Wallet,
} from 'lucide-react';
import { useApp } from '@/context';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import ExpenseForm from './ExpenseForm';

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
      <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">Finance Hub</div>
        <div className="text-[11px] text-muted-foreground">Money, sorted</div>
      </div>
    </div>
  );
}

function ViewingSwitcher() {
  const { isAdmin, people, viewing, setViewing } = useApp();
  if (!isAdmin) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Users className="h-4 w-4 text-muted-foreground" />
      <span className="hidden text-muted-foreground sm:inline">Viewing</span>
      <Select value={viewing} onValueChange={setViewing}>
        <SelectTrigger className="h-8 w-36 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">Everyone</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function UserMenu() {
  const { user, logout, dark, toggleTheme } = useApp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gradient-to-br from-brand-400 to-violet-500 text-sm font-semibold text-white">{user.name[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-xs capitalize text-muted-foreground">{user.role}</div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground">@{user.username}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleTheme}>
          {dark ? <Sun /> : <Moon />}
          {dark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/settings">
            <Settings /> Settings
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} className="text-destructive focus:text-destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { user, isAdmin, version } = useApp();
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
    <nav className="grid gap-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 border-r bg-sidebar p-4 lg:flex">
        <Logo />
        <Button className="w-full" onClick={() => setAdding(true)}>
          <Plus /> Add expense
        </Button>
        <div className="flex-1 overflow-y-auto">{navLinks}</div>
        <UserMenu />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-5 p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigate Finance Hub</SheetDescription>
          <Logo />
          <div className="flex-1 overflow-y-auto">{navLinks}</div>
          <UserMenu />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="flex-1" />
          <ViewingSwitcher />
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          {reminderDue && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <BellRing className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-sm font-medium">You haven&apos;t logged any expenses today. Take 30 seconds to add them.</span>
              <Button size="sm" onClick={() => setAdding(true)}>
                Log now
              </Button>
            </div>
          )}
          <Outlet context={{ openAddExpense: () => setAdding(true) }} />
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/90 pt-1.5 backdrop-blur lg:hidden">
        {[NAV[0], NAV[1], null, NAV[4], NAV[5]].map((item) =>
          item ? (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}
            >
              <item.icon className="h-5 w-5" />
              {item.label.split(' ')[0]}
            </NavLink>
          ) : (
            <div key="add" className="flex justify-center">
              <Button onClick={() => setAdding(true)} className="-mt-6 h-14 w-14 rounded-2xl shadow-lg shadow-primary/30 [&_svg]:size-6" aria-label="Add expense">
                <Plus />
              </Button>
            </div>
          )
        )}
      </nav>

      <ExpenseForm open={adding} onClose={() => setAdding(false)} />
      <Toaster />
    </div>
  );
}
