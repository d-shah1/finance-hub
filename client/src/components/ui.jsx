import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { currentMonth, monthLabel, shiftMonth } from '../lib/format';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ value, onChange }) {
  const isCurrent = value >= currentMonth();
  return (
    <div className="inline-flex items-center rounded-xl border border-black/10 bg-white p-0.5 dark:border-white/10 dark:bg-ink-850">
      <button className="icon-btn h-8 w-8" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold">{monthLabel(value)}</span>
      <button className="icon-btn h-8 w-8" disabled={isCurrent} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Next month">
        <ChevronRight size={16} className={isCurrent ? 'opacity-30' : ''} />
      </button>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-ink-900 sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe flex justify-end gap-2 border-t border-black/5 px-5 py-3 dark:border-white/10">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        const active = value === opt.value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`chip ${active ? 'chip-active' : ''} ${size === 'sm' ? 'px-2.5 py-1 text-xs' : ''}`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`badge ${TONES[tone]} ${className}`}>{children}</span>;
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'brand', children }) {
  const iconTone = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
    good: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    critical: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  }[tone];
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-2">
        <span className="muted text-sm font-medium">{label}</span>
        {Icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="muted mt-1 text-xs">{sub}</div>}
      {children}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-900/40 dark:text-brand-300">
          <Icon size={22} />
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {text && <p className="muted mt-1 max-w-sm text-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin text-brand-500 ${className}`} size={20} />;
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

export function ErrorText({ error }) {
  if (!error) return null;
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error.message || String(error)}</p>;
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
    <button type="button" className={armed ? 'btn-danger' : 'btn-ghost text-red-600 dark:text-red-400'} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Tap again to delete' : label}
    </button>
  );
}

let toastListener = null;
export function toast(message, tone = 'good') {
  toastListener?.({ message, tone, id: Date.now() });
}
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => {
    toastListener = setT;
    return () => (toastListener = null);
  }, []);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 2800);
    return () => clearTimeout(id);
  }, [t]);
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6">
      <div
        className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.tone === 'critical' ? 'bg-red-600' : 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900'}`}
      >
        {t.message}
      </div>
    </div>
  );
}
