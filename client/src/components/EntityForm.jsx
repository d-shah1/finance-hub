import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context';
import { ConfirmDelete, ErrorText, Field, Modal, Segmented, toast } from './ui';

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
      const saved = record
        ? await api(`${endpoint}/${record.id}`, { method: 'PUT', body })
        : await api(endpoint, { method: 'POST', body });
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
          <div className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button form="entity-form" className="btn-primary" disabled={saving || blocked}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="entity-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {blocked && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 sm:col-span-2">
            You are viewing everyone. Pick a person in the top bar to add this for them.
          </p>
        )}
        {fields.map((f) => {
          const v = form[f.name] ?? '';
          const span = f.span === 2 ? 'sm:col-span-2' : '';
          if (f.type === 'segmented') {
            return (
              <div key={f.name} className={span || 'sm:col-span-2'}>
                <span className="label">{f.label}</span>
                <Segmented size="sm" options={f.options} value={v} onChange={(x) => set(f.name, x)} />
              </div>
            );
          }
          if (f.type === 'toggle') {
            return (
              <label key={f.name} className={`flex items-center gap-3 ${span}`}>
                <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={!!Number(v)} onChange={(e) => set(f.name, e.target.checked ? 1 : 0)} />
                <span className="text-sm font-medium">{f.label}</span>
              </label>
            );
          }
          return (
            <Field key={f.name} label={f.label} hint={f.hint} className={span}>
              {f.type === 'select' ? (
                <select className="input" required={f.required} value={v} onChange={(e) => set(f.name, e.target.value)}>
                  {!f.required && <option value="">—</option>}
                  {f.options.map((o) => {
                    const opt = typeof o === 'object' ? o : { value: o, label: o };
                    return (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    );
                  })}
                </select>
              ) : f.type === 'color' ? (
                <div className="flex flex-wrap gap-2">
                  {f.options.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => set(f.name, c)}
                      className={`h-8 w-8 rounded-full ring-offset-2 transition dark:ring-offset-ink-900 ${v === c ? 'ring-2 ring-slate-900 dark:ring-white' : ''}`}
                      style={{ background: c }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              ) : (
                <input
                  className="input"
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
              )}
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
