// App-level building blocks composed from shadcn/ui primitives.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast as sonner } from 'sonner';
import { cn } from '@/lib/utils';
import { currentMonth, monthLabel, shiftMonth } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge as UIBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ value, onChange }) {
  const isCurrent = value >= currentMonth();
  return (
    <div className="inline-flex items-center rounded-md border bg-card shadow-sm">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium">{monthLabel(value)}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isCurrent} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Next month">
        <ChevronRight />
      </Button>
    </div>
  );
}

/** Dialog with a scrolling body and a sticky footer. */
export function Modal({ open, onClose, title, description, children, footer, wide }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('flex flex-col gap-0 bg-card p-0', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? '' : 'sr-only'}>{description || title}</DialogDescription>
        </DialogHeader>
        {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}
        {footer && <DialogFooter className="pb-safe gap-2 border-t px-6 py-3 sm:items-center">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, children, hint, className = '', htmlFor }) {
  return (
    <div className={cn('grid gap-2', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Single-choice pill group (shadcn ToggleGroup). Values may be strings or numbers;
 * clicking the active option keeps it selected rather than clearing it.
 * With `scroll`, the pills stay on one line and scroll sideways, edge to edge in a dialog.
 */
export function Segmented({ options, value, onChange, size = 'default', className, scroll = false }) {
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const rowRef = useRef(null);

  // Keep the selected pill visible, e.g. when editing an expense in a category far along the row.
  useEffect(() => {
    if (!scroll) return;
    const el = rowRef.current?.querySelector('[data-state="on"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [scroll, value, options.length]);

  const group = (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size === 'sm' ? 'sm' : 'default'}
      value={String(value ?? '')}
      onValueChange={(v) => {
        if (!v && v !== '') return;
        const hit = opts.find((o) => String(o.value) === v);
        if (hit) onChange(hit.value);
      }}
      className={cn(scroll ? 'w-max flex-nowrap justify-start' : 'flex-wrap justify-start', !scroll && className)}
    >
      {opts.map((o) => (
        <ToggleGroupItem
          key={String(o.value)}
          value={String(o.value)}
          className={cn(
            'shrink-0 rounded-full data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary',
            size === 'sm' ? 'px-3 text-xs' : 'px-3.5'
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
  if (!scroll) return group;
  return (
    <div ref={rowRef} className={cn('no-scrollbar -mx-6 overflow-x-auto scroll-px-6 px-6 pb-1', className)}>
      {group}
    </div>
  );
}

const TONE_VARIANT = { neutral: 'secondary', brand: 'info', good: 'good', warning: 'warning', critical: 'critical' };
export function Badge({ tone = 'neutral', className, children }) {
  return (
    <UIBadge variant={TONE_VARIANT[tone] || 'secondary'} className={cn('shrink-0', className)}>
      {children}
    </UIBadge>
  );
}

const ICON_TONE = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
  good: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  critical: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
};

export function IconTile({ icon: Icon, tone = 'brand', className }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', ICON_TONE[tone], className)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function StatCard({ label, value, sub, icon, tone = 'brand', children }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon && <IconTile icon={icon} tone={tone} />}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {children}
    </Card>
  );
}

/** Card section with a title row and optional action. */
export function Section({ title, description, action, children, className, bodyClassName }) {
  return (
    <Card className={className}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-3 sm:px-5 sm:pt-5">
          <div>
            {title && <h2 className="font-semibold leading-tight">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-[22px] w-[22px]" />
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function Loading({ rows = 3 }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function ErrorText({ error }) {
  if (!error) return null;
  return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error.message || String(error)}</p>;
}

/** Delete button that asks for a second tap instead of a blocking confirm(). */
export function ConfirmDelete({ onConfirm, label = 'Delete' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button type="button" variant={armed ? 'destructive' : 'ghost'} className={armed ? '' : 'text-destructive hover:text-destructive'} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Tap again to delete' : label}
    </Button>
  );
}

/** Toast helper kept from the old API: toast(message, 'good' | 'critical'). */
export function toast(message, tone = 'good') {
  if (tone === 'critical') sonner.error(message);
  else sonner.success(message);
}
