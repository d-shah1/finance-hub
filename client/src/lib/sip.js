// Mirrors server/lib/sips.js dueDates, for the plan form's live preview.
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(y, m, 0).getDate();

export function sipDueDates({ start_date, end_date, active, day_of_month }, todayIso) {
  if (!start_date) return [];
  const end = end_date ? (end_date < todayIso ? end_date : todayIso) : Number(active) ? todayIso : null;
  if (!end || start_date > end) return [];
  const out = [];
  let [y, m] = start_date.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const day = Math.min(31, Math.max(1, Number(day_of_month) || 1));
  while (y < ey || (y === ey && m <= em)) {
    const d = `${y}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}`;
    if (d >= start_date && d <= end) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
