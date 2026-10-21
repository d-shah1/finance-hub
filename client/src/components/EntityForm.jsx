import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useApp } from '@/context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDelete, ErrorText, Field, Modal, Segmented, toast } from './common';

/**
 * Modal create/edit form driven by a field list.
 * Field: { name, label, type: text|number|date|select|segmented|toggle|color, options, required, hint, span, placeholder }
 */
export default function EntityForm({ open, onClose, endpoint, title, fields, initial, record, onSaved, noun = 'Entry' }) {
  const { refresh, viewingAll } = useApp();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(record ? { ...record } : { ...(typeof initial === 'function' ? initial() : initial) });
    // `initial` is often an inline function; only reset when the modal opens or the record changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = Object.fromEntries(fields.map((f) => [f.name, form[f.name]]));
      const saved = record ? await api(`${endpoint}/${record.id}`, { method: 'PUT', body }) : await api(endpoint, { method: 'POST', body });
      toast(`${noun} ${record ? 'updated' : 'added'}`);
      refresh();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await api(`${endpoint}/${record.id}`, { method: 'DELETE' });
    toast(`${noun} deleted`);
    refresh();
    onClose();
  }

  const blocked = viewingAll && !record;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || `${record ? 'Edit' : 'Add'} ${noun.toLowerCase()}`}
      footer={
        <>
          {record && <ConfirmDelete onConfirm={remove} />}
          <div className="hidden flex-1 sm:block" />
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="entity-form" type="submit" disabled={saving || blocked}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="entity-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {blocked && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 sm:col-span-2">
            You are viewing everyone. Pick a person in the top bar to add this for them.
          </p>
        )}
        {fields.map((f) => {
          const v = form[f.name] ?? '';
          const span = f.span === 2 ? 'sm:col-span-2' : '';
          const id = `ef-${f.name}`;
          if (f.type === 'segmented') {
            return (
              <Field key={f.name} label={f.label} className={span || 'sm:col-span-2'}>
                <Segmented size="sm" options={f.options} value={v} onChange={(x) => set(f.name, x)} />
              </Field>
            );
          }
          if (f.type === 'toggle') {
            return (
              <div key={f.name} className={cn('flex items-center gap-3 self-end pb-1.5', span)}>
                <Switch id={id} checked={!!Number(v)} onCheckedChange={(c) => set(f.name, c ? 1 : 0)} />
                <Label htmlFor={id}>{f.label}</Label>
              </div>
            );
          }
          if (f.type === 'select') {
            const opts = f.options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
            // Radix Select has no empty value, so optional fields get an explicit "None" choice.
            const NONE = '__none';
            return (
              <Field key={f.name} label={f.label} hint={f.hint} className={span}>
                <Select
                  value={v === '' || v === null ? (f.required ? undefined : NONE) : String(v)}
                  onValueChange={(x) => set(f.name, x === NONE ? null : x)}
                >
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {!f.required && <SelectItem value={NONE}>{f.noneLabel || 'None'}</SelectItem>}
                    {opts.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            );
          }
          if (f.type === 'color') {
            return (
              <Field key={f.name} label={f.label} className={span}>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => set(f.name, c)}
                      className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition', v === c && 'ring-2 ring-foreground')}
                      style={{ background: c }}
                      aria-label={`Colour ${c}`}
                      aria-pressed={v === c}
                    />
                  ))}
                </div>
              </Field>
            );
          }
          return (
            <Field key={f.name} label={f.label} hint={f.hint} className={span} htmlFor={id}>
              <Input
                id={id}
                type={f.type || 'text'}
                required={f.required}
                step={f.type === 'number' ? f.step || 'any' : undefined}
                min={f.min}
                max={f.max}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                placeholder={f.placeholder}
                value={v}
                onChange={(e) => set(f.name, e.target.value)}
              />
            </Field>
          );
        })}
        <div className="sm:col-span-2">
          <ErrorText error={error} />
        </div>
      </form>
    </Modal>
  );
}
