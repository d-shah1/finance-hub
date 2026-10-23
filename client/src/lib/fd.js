// Browser copy of server/lib/fd.js maturity maths, for the FD form's live preview.
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const toIso = (d) => d.toISOString().slice(0, 10);
const N = { monthly: 12, quarterly: 4, 'half-yearly': 2, yearly: 1, simple: 0 };

export function maturityDate(start, months = 0, days = 0) {
  if (!start) return null;
  let [y, m, d] = start.split('-').map(Number);
  m += Number(months) || 0;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12) + 1;
  const base = new Date(`${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + (Number(days) || 0));
  return toIso(base);
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** { maturity, amount, interest } for the form values, or null if incomplete. */
export function fdPreview(f) {
  const principal = Number(f.principal);
  const rate = Number(f.rate) / 100;
  const maturity = maturityDate(f.start_date, f.tenure_months, f.tenure_days);
  if (!principal || !rate || !maturity) return null;
  const days = daysBetween(f.start_date, maturity);
  if (days < 7) return { maturity, days, tooShort: true };
  const t = days / 365;
  const n = N[f.compounding || 'quarterly'];
  if ((f.payout || 'cumulative') !== 'cumulative') return { maturity, days, amount: principal, interest: principal * rate * t, payout: true };
  const amount = !n || days < 181 ? principal * (1 + rate * t) : principal * (1 + rate / n) ** (n * t);
  return { maturity, days, amount, interest: amount - principal };
}
