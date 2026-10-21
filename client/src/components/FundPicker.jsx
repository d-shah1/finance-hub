import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from './common';

/**
 * Search mfapi.in (through our server) and pick a fund. Value is { code, name } or null.
 * Prefer "Direct ... Growth" if that is what you hold; the plan type changes the NAV.
 */
export default function FundPicker({ value, onChange, suggest }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(!value?.code);
  const [typed, setTyped] = useState(false);

  useEffect(() => setEditing(!value?.code), [value?.code]);
  // Start the search from the plan's name (it can arrive after the form opens) until the person types.
  useEffect(() => {
    if (editing && !typed && suggest) setQ(suggest);
  }, [editing, typed, suggest]);

  useEffect(() => {
    if (!editing || q.trim().length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const list = await api('/mf/search', { params: { q } });
        if (!cancelled) setResults(list);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, editing]);

  if (!editing && value?.code) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="min-w-0 flex-1 truncate text-sm" title={value.name}>
          {value.name || `Scheme ${value.code}`}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}>
          Change
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onChange(null)} aria-label="Unlink fund">
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search fund name, e.g. parag parikh flexi"
          value={q}
          onChange={(e) => {
            setTyped(true);
            setQ(e.target.value);
          }}
        />
        {busy && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      </div>
      {error && <p className="text-xs text-destructive">{error.message}</p>}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border" role="listbox" aria-label="Matching funds">
          {results.map((f) => {
            const direct = /direct/i.test(f.name) && /growth/i.test(f.name);
            return (
              <li key={f.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.code === f.code}
                  onClick={() => {
                    onChange(f);
                    setEditing(false);
                  }}
                  className={cn('flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent', direct && 'font-medium')}
                >
                  <span className="flex-1">{f.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!busy && q.trim().length >= 3 && !results.length && !error && <p className="text-xs text-muted-foreground">No funds match. Try fewer words.</p>}
    </div>
  );
}
