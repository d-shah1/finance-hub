// Read-only Groww integration: pulls each person's stock holdings once a day.
//
// Credentials come only from environment variables, one pair per username:
//   GROWW_<USERNAME>_TOTP_TOKEN   the long token shown when you create a TOTP key in Groww
//   GROWW_<USERNAME>_TOTP_SECRET  the TOTP secret (the code an authenticator app would use)
// The daily access token they produce is kept in memory only. This module only ever calls the
// holdings endpoint, but the credentials themselves can trade, so keep them out of the database and logs.
import { db, getSetting, setSetting } from '../db.js';
import { totp } from './totp.js';
import { refreshPrices } from './prices.js';

const API = 'https://api.groww.in';
const MIN_SYNC_GAP_MS = 2 * 60 * 1000; // Groww allows ~150 token requests a day; don't let "Sync now" burn them.

class GrowwError extends Error {}

function envKey(username) {
  return `GROWW_${username.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function growwCredentials(username) {
  const base = envKey(username);
  const token = process.env[`${base}_TOTP_TOKEN`];
  const secret = process.env[`${base}_TOTP_SECRET`];
  return token && secret ? { token, secret } : null;
}

// Access tokens last until 6 AM IST the next day; reuse one while this instance is warm.
const accessTokens = new Map();

async function call(path, { method = 'GET', bearer, body }) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Accept: 'application/json',
      'X-API-VERSION': '1.0',
      Authorization: `Bearer ${bearer}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || json?.status === 'FAILURE') {
    const msg = json?.error?.message || json?.message || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new GrowwError(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function accessToken(username, creds) {
  const cached = accessTokens.get(username);
  if (cached && cached.until > Date.now()) return cached.token;
  let json;
  try {
    json = await call('/v1/token/api/access', { method: 'POST', bearer: creds.token, body: { key_type: 'totp', totp: totp(creds.secret) } });
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      throw new GrowwError('Groww rejected the TOTP token or secret. Create a new TOTP key in Groww and update the Vercel variables.');
    }
    throw e;
  }
  const token = json?.token || json?.access_token || json?.payload?.token;
  if (!token) throw new GrowwError('Groww did not return an access token.');
  // Expire well before Groww's 6 AM cut-off; a fresh one is cheap.
  accessTokens.set(username, { token, until: Date.now() + 6 * 3600 * 1000 });
  return token;
}

async function fetchHoldings(username, creds) {
  const token = await accessToken(username, creds);
  let json;
  try {
    json = await call('/v1/holdings/user', { bearer: token });
  } catch (e) {
    if (e.status === 401) accessTokens.delete(username);
    throw e;
  }
  const list = json?.payload?.holdings ?? json?.holdings;
  if (!Array.isArray(list)) throw new GrowwError('Unexpected response from Groww holdings API.');
  return list
    .map((h) => ({
      symbol: String(h.trading_symbol || h.tradingSymbol || h.symbol || '').trim().toUpperCase(),
      isin: h.isin || null,
      quantity: Number(h.quantity) || 0,
      avg_price: Number(h.average_price ?? h.averagePrice ?? h.avg_price) || 0,
    }))
    .filter((h) => h.symbol && h.quantity > 0);
}

/**
 * Brings one person's Groww holdings into the app. Groww rows are matched by ISIN (or symbol),
 * updated in place, added when new and removed when sold. A manual row for the same stock is taken
 * over rather than duplicated. Other manual rows are never touched.
 */
async function applyHoldings(userId, list) {
  const existing = await db.all('SELECT * FROM holdings WHERE user_id = ?', userId);
  const kept = new Set();
  let added = 0;
  let updated = 0;
  for (const h of list) {
    const match =
      existing.find((r) => r.source === 'groww' && ((h.isin && r.isin === h.isin) || r.symbol.toUpperCase() === h.symbol)) ||
      existing.find((r) => r.source !== 'groww' && !kept.has(r.id) && r.symbol.toUpperCase() === h.symbol && ['NSE', 'BSE'].includes(r.exchange));
    if (match) {
      await db.run(
        "UPDATE holdings SET symbol = ?, isin = ?, quantity = ?, avg_price = ?, source = 'groww', synced_at = datetime('now') WHERE id = ?",
        h.symbol, h.isin, h.quantity, h.avg_price, match.id
      );
      kept.add(match.id);
      updated++;
    } else {
      const { lastInsertRowid } = await db.run(
        "INSERT INTO holdings (user_id, symbol, exchange, quantity, avg_price, isin, source, synced_at) VALUES (?, ?, 'NSE', ?, ?, ?, 'groww', datetime('now'))",
        userId, h.symbol, h.quantity, h.avg_price, h.isin
      );
      kept.add(lastInsertRowid);
      added++;
    }
  }
  let removed = 0;
  for (const r of existing) {
    if (r.source === 'groww' && !kept.has(r.id)) {
      await db.run('DELETE FROM holdings WHERE id = ?', r.id);
      removed++;
    }
  }
  return { added, updated, removed, ids: [...kept] };
}

export async function growwStatus(user) {
  const raw = await getSetting(`groww_status:${user.id}`);
  // envPrefix names the variables to set (not their values) for the "How to connect" help.
  return { configured: !!growwCredentials(user.username), envPrefix: envKey(user.username), last: raw ? JSON.parse(raw) : null };
}

/** Syncs one person. Returns the stored status, recording failures instead of throwing for scheduled runs. */
export async function syncGroww(user, { force = false } = {}) {
  const creds = growwCredentials(user.username);
  if (!creds) throw new GrowwError(`Groww is not connected. Add ${envKey(user.username)}_TOTP_TOKEN and ${envKey(user.username)}_TOTP_SECRET in Vercel.`);
  const prev = (await growwStatus(user)).last;
  if (!force && prev?.at && Date.now() - Date.parse(prev.at) < MIN_SYNC_GAP_MS) {
    throw new GrowwError('Synced a moment ago. Try again in a couple of minutes.');
  }
  let status;
  try {
    const list = await fetchHoldings(user.username, creds);
    const result = await applyHoldings(user.id, list);
    // Groww's live prices need its paid plan, so values come from the free Yahoo Finance quotes.
    const rows = result.ids.length ? await db.all(`SELECT * FROM holdings WHERE id IN (${result.ids.map(() => '?').join(',')})`, ...result.ids) : [];
    const priced = await refreshPrices(rows);
    status = {
      at: new Date().toISOString(),
      ok: true,
      count: list.length,
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      pricesUpdated: priced.filter((p) => p.ok).length,
    };
  } catch (e) {
    status = { at: new Date().toISOString(), ok: false, error: e instanceof GrowwError ? e.message : `Groww sync failed: ${e.message}` };
  }
  await setSetting(`groww_status:${user.id}`, JSON.stringify(status));
  return status;
}

/** Daily run for everyone who has Groww credentials set. */
export async function syncAllGroww() {
  const users = await db.all('SELECT * FROM users');
  const results = [];
  for (const u of users) {
    if (!growwCredentials(u.username)) continue;
    results.push({ user: u.username, ...(await syncGroww(u, { force: true })) });
  }
  return results;
}
