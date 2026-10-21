import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const { init, db } = await import('../db.js');
const { createApp } = await import('../app.js');
const { navFor, xirr } = await import('../lib/mf.js');
const { addDays, today } = await import('../lib/dates.js');

const realFetch = globalThis.fetch;
let server;
let base;
const mfCalls = [];

// A fake fund: NAV 10 on weekdays for the past ~2 years, rising to 12 today; no NAV on weekends.
function fakeHistory(code) {
  const data = [];
  const end = today();
  for (let i = 0; i < 800; i++) {
    const iso = addDays(end, -i);
    const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (day === 0 || day === 6) continue;
    const nav = code === '200' ? 50 : i === 0 ? 12 : 10;
    const [y, m, d] = iso.split('-');
    data.push({ date: `${d}-${m}-${y}`, nav: nav.toFixed(4) });
  }
  return { meta: { scheme_name: code === '200' ? 'Other Fund - Direct Growth' : 'Test Flexi Cap Fund - Direct Plan - Growth', scheme_code: Number(code) }, data, status: 'SUCCESS' };
}

before(async () => {
  await init();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://api.mfapi.in')) {
      mfCalls.push(u);
      const json = u.includes('/mf/search')
        ? [{ schemeCode: 100, schemeName: 'Test Flexi Cap Fund - Direct Plan - Growth' }, { schemeCode: 101, schemeName: 'Test Flexi Cap Fund - Regular Plan - Growth' }]
        : fakeHistory(u.split('/mf/')[1]);
      return { ok: true, status: 200, json: async () => json };
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

test('XIRR matches known answers', () => {
  // ₹1,000 that becomes ₹1,100 after a year is 10% a year.
  assert.ok(Math.abs(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]) - 0.1) < 1e-4);
  // Two instalments, money doubled-ish: rate is positive and finite.
  const r = xirr([{ date: '2024-01-01', amount: -1000 }, { date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 2500 }]);
  assert.ok(r > 0.1 && r < 0.3);
  assert.equal(xirr([{ date: '2025-01-01', amount: -1000 }]), null);
});

test('weekend and holiday instalments use the next published NAV', () => {
  const navs = [{ date: '2026-03-06', nav: 10 }, { date: '2026-03-09', nav: 11 }];
  assert.equal(navFor(navs, '2026-03-06'), 10);
  assert.equal(navFor(navs, '2026-03-07'), 11, 'Saturday -> Monday');
  assert.equal(navFor(navs, '2026-03-20'), null, 'not published yet');
});

test('fund search goes through the app', async () => {
  const darsh = await login('darsh', 'darsh123');
  const r = await darsh('/mf/search?q=flexi');
  assert.equal(r.body.length, 2);
  assert.deepEqual(r.body[0], { code: '100', name: 'Test Flexi Cap Fund - Direct Plan - Growth' });
  assert.deepEqual((await darsh('/mf/search?q=ab')).body, [], 'too short to search');
});

test('a linked SIP shows units, current value, gain and XIRR, and totals use it', async () => {
  const darsh = await login('darsh', 'darsh123');
  const sip = (
    await darsh('/sips', {
      method: 'POST',
      body: { name: 'Flexi', amount: 1000, day_of_month: 3, start_date: addDays(today(), -365), scheme_code: '100', scheme_name: 'Test Flexi Cap Fund - Direct Plan - Growth' },
    })
  ).body;
  const rows = await db.all('SELECT * FROM investments WHERE sip_id = ?', sip.id);
  assert.ok(rows.length >= 11);
  const past = rows.filter((r) => r.date < today());
  assert.ok(past.every((r) => r.units && Math.abs(r.units - r.amount / 10) < 1e-9), 'bought at NAV 10');

  const plan = (await darsh('/sips/status')).body.find((s) => s.id === sip.id);
  const v = plan.valuation;
  assert.equal(v.nav, 12);
  assert.equal(v.cost, rows.length * 1000);
  const expectUnits = past.length * 100 + rows.filter((r) => r.date === today()).length * (1000 / 12);
  assert.ok(Math.abs(v.units - expectUnits) < 1e-6);
  assert.ok(Math.abs(v.value - v.units * 12) < 1e-6);
  assert.ok(v.gain > 0 && v.xirr > 0.15, `NAV up 20% over the year gives a strong XIRR (${v.xirr})`);

  const s = (await darsh('/insights/summary')).body;
  assert.ok(Math.abs(s.currentValue - v.value) < 1e-6, 'no other investments or stocks');
  assert.equal(s.totalInvestedAllTime, v.cost);

  // Editing an instalment's amount re-values it.
  const first = past[0];
  await darsh(`/investments/${first.id}`, { method: 'PUT', body: { amount: 2000 } });
  const edited = await db.get('SELECT * FROM investments WHERE id = ?', first.id);
  assert.equal(edited.units, 200);

  // Linking a different fund re-prices every instalment with that fund's NAV.
  await darsh(`/sips/${sip.id}`, { method: 'PUT', body: { scheme_code: '200', scheme_name: 'Other Fund - Direct Growth' } });
  const repriced = await db.all('SELECT * FROM investments WHERE sip_id = ? AND units IS NOT NULL', sip.id);
  assert.ok(repriced.every((r) => Math.abs(r.nav - 50) < 1e-9));
  assert.equal((await darsh('/sips/status')).body.find((x) => x.id === sip.id).valuation.nav, 50);
});

test('refresh works per person and reports problems instead of failing', async () => {
  const bhakti = await login('bhakti', 'bhakti123');
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (String(url).includes('/mf/999') ? { ok: false, status: 500, json: async () => ({}) } : prev(url, opts));
  // Saving still works while the fund service is down.
  const created = await bhakti('/sips', { method: 'POST', body: { name: 'Broken', amount: 500, day_of_month: 1, start_date: addDays(today(), -60), scheme_code: '999' } });
  assert.equal(created.status, 201);
  const r = await bhakti('/mf/refresh', { method: 'POST' });
  globalThis.fetch = prev;
  assert.equal(r.status, 200);
  assert.equal(r.body.errors.length, 1);
  assert.match(r.body.errors[0].error, /500/);
  // Without a NAV the plan is simply valued at cost.
  const s = (await bhakti('/insights/summary')).body;
  assert.equal(s.currentValue, s.totalInvestedAllTime);
});
