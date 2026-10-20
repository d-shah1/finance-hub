import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.GROWW_DARSH_TOTP_TOKEN = 'eyJ.long-totp-token';
process.env.GROWW_DARSH_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const { init, db } = await import('../db.js');
const { createApp } = await import('../app.js');
const { totp } = await import('../lib/totp.js');
const { tick } = await import('../lib/scheduler.js');

const realFetch = globalThis.fetch;
let server;
let base;
let growwHoldings;
const growwCalls = [];

before(async () => {
  await init();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  // Fake Groww and Yahoo; everything else (our own API) goes to the real fetch.
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const reply = (status, json) => ({ ok: status < 400, status, text: async () => JSON.stringify(json), json: async () => json });
    if (u.startsWith('https://api.groww.in')) {
      growwCalls.push({ url: u, method: opts.method || 'GET', headers: opts.headers, body: opts.body && JSON.parse(opts.body) });
      if (u.endsWith('/v1/token/api/access')) return reply(200, { token: 'daily-access-token' });
      if (u.endsWith('/v1/holdings/user')) return reply(200, { status: 'SUCCESS', payload: { holdings: growwHoldings } });
    }
    if (u.startsWith('https://query1.finance.yahoo.com')) {
      const price = { 'INFY.NS': 1600, 'TCS.NS': 4000, 'HDFCBANK.NS': 1750 }[decodeURIComponent(u.split('/chart/')[1].split('?')[0])];
      return reply(200, { chart: { result: [{ meta: { regularMarketPrice: price } }] } });
    }
    return realFetch(url, opts);
  };
});
after(() => {
  globalThis.fetch = realFetch;
  server.close();
});

async function login(username, password) {
  const res = await realFetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (path, opts = {}) => {
    const r = await realFetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', cookie }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    return { status: r.status, body: await r.json() };
  };
}

test('TOTP matches the RFC 6238 test vector', () => {
  // RFC 6238 SHA-1 secret "12345678901234567890" at T=59s is 94287082 (8 digits).
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { time: 59_000, digits: 8 }), '94287082');
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { time: 59_000 }), '287082');
});

test('sync adds, updates and removes Groww stocks and leaves manual ones alone', async () => {
  const darsh = await login('darsh', 'darsh123');
  const bhakti = await login('bhakti', 'bhakti123');

  // A manual INFY row gets taken over by the sync; a manual US stock is never touched.
  await darsh('/holdings', { method: 'POST', body: { symbol: 'INFY', exchange: 'NSE', quantity: 5, avg_price: 1400 } });
  await darsh('/holdings', { method: 'POST', body: { symbol: 'AAPL', exchange: 'NASDAQ', quantity: 2, avg_price: 15000 } });

  assert.deepEqual((await darsh('/holdings/groww')).body.configured, true);
  assert.equal((await bhakti('/holdings/groww')).body.configured, false);
  assert.equal((await bhakti('/holdings/groww/sync', { method: 'POST' })).status, 400, 'not connected');

  growwHoldings = [
    { isin: 'INE009A01021', trading_symbol: 'INFY', quantity: 12, average_price: 1450.5 },
    { isin: 'INE467B01029', trading_symbol: 'TCS', quantity: 3, average_price: 3500 },
  ];
  const first = await darsh('/holdings/groww/sync', { method: 'POST' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual([first.body.added, first.body.updated, first.body.removed], [1, 1, 0]);

  // Requests: TOTP token exchange, then holdings with the daily token.
  const [tokenCall, holdingsCall] = growwCalls;
  assert.equal(tokenCall.method, 'POST');
  assert.equal(tokenCall.headers.Authorization, 'Bearer eyJ.long-totp-token');
  assert.equal(tokenCall.body.key_type, 'totp');
  assert.match(tokenCall.body.totp, /^\d{6}$/);
  assert.equal(holdingsCall.headers.Authorization, 'Bearer daily-access-token');
  assert.equal(holdingsCall.headers['X-API-VERSION'], '1.0');
  assert.ok(growwCalls.every((c) => !/order/i.test(c.url)), 'never touches order endpoints');

  let rows = (await darsh('/holdings')).body;
  const bySym = Object.fromEntries(rows.map((r) => [r.symbol, r]));
  assert.equal(rows.length, 3, 'INFY taken over (no duplicate), TCS added, AAPL kept');
  assert.equal(bySym.INFY.source, 'groww');
  assert.equal(bySym.INFY.quantity, 12);
  assert.equal(bySym.INFY.avg_price, 1450.5);
  assert.equal(bySym.INFY.current_price, 1600, 'priced from Yahoo');
  assert.equal(bySym.AAPL.source, 'manual');

  // Throttle repeated manual syncs.
  assert.equal((await darsh('/holdings/groww/sync', { method: 'POST' })).status, 400);

  // Next day: TCS sold, HDFCBANK bought. The scheduled morning job does the sync.
  growwHoldings = [
    { isin: 'INE009A01021', trading_symbol: 'INFY', quantity: 12, average_price: 1450.5 },
    { isin: 'INE040A01034', trading_symbol: 'HDFCBANK', quantity: 10, average_price: 1600 },
  ];
  await tick(new Date('2026-10-21T03:40:00Z'), { job: 'morning' });
  rows = (await darsh('/holdings')).body;
  assert.deepEqual(rows.map((r) => r.symbol).sort(), ['AAPL', 'HDFCBANK', 'INFY']);
  const status = (await darsh('/holdings/groww')).body.last;
  assert.equal(status.ok, true);
  assert.equal(status.removed, 1);

  // Secrets never end up in the database or API responses.
  const dump = JSON.stringify(await db.all('SELECT * FROM app_settings')) + JSON.stringify(rows) + JSON.stringify(status);
  assert.ok(!dump.includes('eyJ.long-totp-token') && !dump.includes('GEZDGNBV') && !dump.includes('daily-access-token'));
});

test('a rejected TOTP is reported clearly and recorded', async () => {
  // Bhakti has no cached access token, so the sync must go through the token exchange.
  process.env.GROWW_BHAKTI_TOTP_TOKEN = 'eyJ.revoked';
  process.env.GROWW_BHAKTI_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const bhakti = await login('bhakti', 'bhakti123');
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, opts) =>
    String(url).includes('/v1/token/') ? { ok: false, status: 401, text: async () => '{"error":{"message":"Invalid token"}}' } : prev(url, opts);
  const res = await bhakti('/holdings/groww/sync', { method: 'POST' });
  globalThis.fetch = prev;
  assert.equal(res.status, 502);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /rejected the TOTP/);
  assert.equal((await bhakti('/holdings/groww')).body.last.ok, false, 'failure is shown in the app');
});
