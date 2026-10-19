const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrFmt2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const inr = (n, precise = false) => (precise ? inrFmt2 : inrFmt).format(Number(n) || 0);

/** Compact rupee figure for axes: ₹1.2L, ₹45K. */
export function inrShort(n) {
  const v = Math.abs(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}₹${Math.round(v)}`;
}

export const pct = (n, digits = 0) => `${((Number(n) || 0) * 100).toFixed(digits)}%`;

const pad = (n) => String(n).padStart(2, '0');

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function currentMonth() {
  return todayIso().slice(0, 7);
}
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
}
export function monthLabel(ym, style = 'long') {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: style, year: 'numeric' });
}
export function shortMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}
export function niceDate(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', opts);
}
export function relativeDay(iso) {
  const t = todayIso();
  if (iso === t) return 'Today';
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((new Date(`${t}T00:00:00`) - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  return niceDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}
