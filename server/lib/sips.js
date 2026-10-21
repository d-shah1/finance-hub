// SIP plans fill in their own instalments: one investment row per month on the debit day, from the
// plan's start date up to today (or the day it stopped). Rows written this way are marked auto = 1.
//
// - A month that already has any row for the plan (logged by hand, or edited) is left alone.
// - Deleting an instalment records a skip, so a missed or bounced month is not filled in again.
// - Editing an instalment turns it into a normal row (auto = 0) that the plan never touches.
import { client, db } from '../db.js';
import { clampedDate, today } from './dates.js';

const monthOf = (iso) => iso.slice(0, 7);

function* months(fromIso, toIso) {
  let [y, m] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    yield [y, m];
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

export const planStart = (sip) => sip.start_date || sip.created_at.slice(0, 10);

/** Last day instalments run to: the stop date, today for an active plan, or null for a paused plan with no stop date. */
export function planEnd(sip, todayIso = today()) {
  if (sip.end_date) return sip.end_date < todayIso ? sip.end_date : todayIso;
  return sip.active ? todayIso : null;
}

/** Instalment dates a plan should have by `todayIso`. */
export function dueDates(sip, todayIso = today()) {
  const start = planStart(sip);
  const end = planEnd(sip, todayIso);
  if (!end || start > end) return [];
  const out = [];
  for (const [y, m] of months(start, end)) {
    const d = clampedDate(y, m, sip.day_of_month);
    if (d >= start && d <= end) out.push(d);
  }
  return out;
}

/** Writes any missing instalments for one plan. Returns how many were added. */
export async function fillPlan(sip, todayIso = today()) {
  const dates = dueDates(sip, todayIso);
  if (!dates.length) return 0;
  const [rows, skips] = await Promise.all([
    db.all('SELECT date FROM investments WHERE sip_id = ?', sip.id),
    db.all('SELECT month FROM sip_skips WHERE sip_id = ?', sip.id),
  ]);
  const taken = new Set([...rows.map((r) => monthOf(r.date)), ...skips.map((s) => s.month)]);
  const missing = dates.filter((d) => !taken.has(monthOf(d)));
  if (!missing.length) return 0;
  await client.batch(
    missing.map((d) => ({
      sql: 'INSERT INTO investments (user_id, sip_id, date, name, type, amount, platform, bank_account_id, auto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
      args: [sip.user_id, sip.id, d, sip.name, sip.type, sip.amount, sip.platform ?? null, sip.bank_account_id ?? null],
    })),
    'write'
  );
  return missing.length;
}

/** Brings every plan (of one person, or everyone when uid is null) up to date. Cheap when nothing is missing. */
export async function fillAllPlans(uid = null, todayIso = today()) {
  const sips = await db.all(`SELECT * FROM sips ${uid !== null ? 'WHERE user_id = ?' : ''}`, ...(uid !== null ? [uid] : []));
  let added = 0;
  for (const s of sips) added += await fillPlan(s, todayIso);
  return added;
}

/** After a plan's dates change, removes auto instalments that now fall outside it. Hand-entered rows stay. */
export async function trimPlan(sip) {
  const start = planStart(sip);
  await db.run('DELETE FROM investments WHERE sip_id = ? AND auto = 1 AND date < ?', sip.id, start);
  if (sip.end_date) await db.run('DELETE FROM investments WHERE sip_id = ? AND auto = 1 AND date > ?', sip.id, sip.end_date);
}

/** Marks a month as deliberately empty, e.g. a skipped or bounced SIP. */
export function skipMonth(sipId, dateIso) {
  return db.run('INSERT OR IGNORE INTO sip_skips (sip_id, month) VALUES (?, ?)', sipId, monthOf(dateIso));
}

/** When a paused plan is resumed, the paused months stay empty rather than being back-filled. */
export async function skipPausedMonths(sip, todayIso = today()) {
  if (!sip.end_date) return;
  const after = { ...sip, start_date: sip.end_date, end_date: null, active: 1 };
  for (const d of dueDates(after, todayIso)) {
    if (d > sip.end_date && d < todayIso) await skipMonth(sip.id, d);
  }
}
