// Mutual fund values from mfapi.in (free, no key). A SIP plan linked to a scheme gets, for each
// instalment, the NAV on its date and the units it bought; units x latest NAV is the current value.
// Units are an estimate: funds allot at the NAV of the day the money reaches them, which can be a
// day or two after the debit, and stamp duty is ignored. Close, not to the paisa.
import { db } from '../db.js';
import { addDays, today } from './dates.js';

const API = 'https://api.mfapi.in';
const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map(); // code -> { at, name, navs }

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Fund data service returned ${res.status}`);
  return res.json();
}

const isoFromDmy = (dmy) => {
  const [d, m, y] = String(dmy).split('-');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export async function searchFunds(q) {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  const list = await getJson(`${API}/mf/search?q=${encodeURIComponent(query)}`);
  return (Array.isArray(list) ? list : [])
    .map((f) => ({ code: String(f.schemeCode), name: f.schemeName }))
    .filter((f) => f.code && f.name)
    .slice(0, 25);
}

/** NAV history oldest first: [{ date: 'YYYY-MM-DD', nav }]. `fresh` skips the short-lived cache. */
export async function navHistory(code, { fresh = false } = {}) {
  const hit = cache.get(code);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit;
  const json = await getJson(`${API}/mf/${encodeURIComponent(code)}`);
  const navs = (json?.data || [])
    .map((r) => ({ date: isoFromDmy(r.date), nav: Number(r.nav) }))
    .filter((r) => r.nav > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!navs.length) throw new Error('No NAV data for this fund');
  const out = { at: Date.now(), name: json?.meta?.scheme_name || null, navs };
  cache.set(code, out);
  return out;
}

/**
 * NAV used for an instalment on `date`: that day's NAV, or the next published one (weekends and
 * holidays), looking at most 7 days ahead. Null if it is not published yet.
 */
export function navFor(navs, date) {
  const limit = addDays(date, 7);
  let lo = 0;
  let hi = navs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (navs[mid].date < date) lo = mid + 1;
    else hi = mid;
  }
  const hit = navs[lo];
  return hit && hit.date <= limit ? hit.nav : null;
}

/** Fills NAV/units for a plan's instalments and stores the fund's latest NAV. Returns { valued, pending }. */
export async function valuePlan(sip, { fresh = false } = {}) {
  if (!sip.scheme_code) return { valued: 0, pending: 0 };
  const { name, navs } = await navHistory(sip.scheme_code, { fresh });
  const latest = navs.at(-1);
  await db.run(
    `INSERT INTO mf_schemes (code, name, nav, nav_date, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(code) DO UPDATE SET name = COALESCE(excluded.name, name), nav = excluded.nav, nav_date = excluded.nav_date, updated_at = excluded.updated_at`,
    sip.scheme_code, name || sip.scheme_name, latest.nav, latest.date
  );
  const rows = await db.all('SELECT id, date, amount FROM investments WHERE sip_id = ? AND units IS NULL', sip.id);
  let valued = 0;
  for (const r of rows) {
    const nav = navFor(navs, r.date);
    if (!nav) continue;
    await db.run('UPDATE investments SET nav = ?, units = ? WHERE id = ?', nav, r.amount / nav, r.id);
    valued++;
  }
  return { valued, pending: rows.length - valued };
}

/**
 * Values every linked plan (one person, or everyone) with freshly fetched NAVs, one fetch per fund.
 * Failures are collected, not thrown.
 */
export async function valueAllPlans(uid = null) {
  const sips = await db.all(
    `SELECT * FROM sips WHERE scheme_code IS NOT NULL AND scheme_code != '' ${uid !== null ? 'AND user_id = ?' : ''}`,
    ...(uid !== null ? [uid] : [])
  );
  const errors = [];
  const fetched = new Set();
  let valued = 0;
  for (const s of sips) {
    try {
      valued += (await valuePlan(s, { fresh: !fetched.has(s.scheme_code) })).valued;
      fetched.add(s.scheme_code);
    } catch (e) {
      errors.push({ plan: s.name, error: e.message });
    }
  }
  return { plans: sips.length, valued, errors };
}

/** Forget a plan's units, e.g. after it is linked to a different fund. */
export function clearPlanUnits(sipId) {
  return db.run('UPDATE investments SET nav = NULL, units = NULL WHERE sip_id = ?', sipId);
}

/**
 * XIRR: the yearly rate r at which the cash flows' present values sum to zero.
 * flows: [{ date: 'YYYY-MM-DD', amount }] with investments negative and the current value positive.
 */
export function xirr(flows) {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Date.parse(flows[0].date);
  const yrs = flows.map((f) => (Date.parse(f.date) - t0) / (365 * 864e5));
  const npv = (r) => flows.reduce((s, f, i) => s + f.amount / (1 + r) ** yrs[i], 0);
  // Bisection on a wide bracket: slower than Newton but never diverges.
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  if (fLo * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-9) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Current value, gain and XIRR for each plan, from stored units (no network). */
export async function planValues(uid = null) {
  const rows = await db.all(
    `SELECT s.id, s.scheme_code, m.nav, m.nav_date, i.date, i.amount, i.units
     FROM sips s JOIN investments i ON i.sip_id = s.id LEFT JOIN mf_schemes m ON m.code = s.scheme_code
     WHERE s.scheme_code IS NOT NULL AND s.scheme_code != '' ${uid !== null ? 'AND s.user_id = ?' : ''}
     ORDER BY i.date`,
    ...(uid !== null ? [uid] : [])
  );
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.id)) by.set(r.id, { nav: r.nav, nav_date: r.nav_date, rows: [] });
    by.get(r.id).rows.push(r);
  }
  const out = {};
  for (const [id, p] of by) {
    if (!p.nav) continue;
    const units = p.rows.reduce((t, r) => t + (r.units || 0), 0);
    const valuedCost = p.rows.filter((r) => r.units != null).reduce((t, r) => t + r.amount, 0);
    const pendingCost = p.rows.filter((r) => r.units == null).reduce((t, r) => t + r.amount, 0);
    // Instalments without a NAV yet (e.g. today's) count at cost.
    const value = units * p.nav + pendingCost;
    const cost = valuedCost + pendingCost;
    const flows = [...p.rows.map((r) => ({ date: r.date, amount: -r.amount })), { date: p.nav_date > today() ? today() : p.nav_date, amount: value }];
    out[id] = { units, nav: p.nav, nav_date: p.nav_date, value, cost, gain: value - cost, xirr: xirr(flows), pending: p.rows.filter((r) => r.units == null).length };
  }
  return out;
}
