import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const { init, db } = await import('../db.js');
const { createApp } = await import('../app.js');
const { dueDates, fillPlan } = await import('../lib/sips.js');
const { today, addDays } = await import('../lib/dates.js');

let server;
let base;
before(async () => {
  await init();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function login(username, password) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', cookie }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    return { status: r.status, body: await r.json() };
  };
}

const rowsOf = (sipId) => db.all('SELECT * FROM investments WHERE sip_id = ? ORDER BY date', sipId);

test('instalment dates: monthly on the debit day, clamped to short months, within start and stop', () => {
  const sip = { start_date: '2024-01-15', day_of_month: 31, active: 1, created_at: '2024-01-15' };
  const d = dueDates(sip, '2024-05-10');
  assert.deepEqual(d, ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
  // Started after this month's debit day: first instalment is next month.
  assert.deepEqual(dueDates({ ...sip, start_date: '2024-01-20', day_of_month: 5 }, '2024-03-04'), ['2024-02-05']);
  // Paused with no stop date: nothing new.
  assert.deepEqual(dueDates({ ...sip, active: 0 }, '2024-05-10'), []);
  // Stopped: up to the stop date only.
  assert.deepEqual(dueDates({ ...sip, end_date: '2024-03-15', active: 0 }, '2024-05-10'), ['2024-01-31', '2024-02-29']);
});

test('a SIP started three years ago fills in every month and counts in the totals', async () => {
  const darsh = await login('darsh', 'darsh123');
  const start = addDays(today(), -3 * 365);
  const sip = (await darsh('/sips', { method: 'POST', body: { name: 'Nifty 50 Index', amount: 5000, day_of_month: 5, start_date: start } })).body;
  const rows = await rowsOf(sip.id);
  const expected = dueDates({ ...sip, created_at: sip.created_at }).length;
  assert.ok(expected >= 35 && expected <= 37, `about 36 months, got ${expected}`);
  assert.equal(rows.length, expected);
  assert.ok(rows.every((r) => r.auto === 1 && r.amount === 5000 && r.date.endsWith('-05')));

  const status = (await darsh('/sips/status')).body.find((s) => s.id === sip.id);
  assert.equal(status.instalments, expected);
  assert.equal(status.invested, expected * 5000);

  const summary = (await darsh('/insights/summary')).body;
  assert.equal(summary.contributions, expected * 5000);
  assert.equal(summary.totalInvestedAllTime, expected * 5000, 'no stocks yet');

  // Filling again changes nothing.
  assert.equal(await fillPlan(await db.get('SELECT * FROM sips WHERE id = ?', sip.id)), 0);
});

test('edits, skips, start-date changes, pause/resume and stop are respected', async () => {
  const darsh = await login('darsh', 'darsh123');
  const sip = (await darsh('/sips', { method: 'POST', body: { name: 'Flexi cap', amount: 2000, day_of_month: 10, start_date: '2025-01-01' } })).body;
  let rows = await rowsOf(sip.id);
  const n = rows.length;

  // Edit January (it was ₹2,500 that month) and delete February (bounced).
  await darsh(`/investments/${rows[0].id}`, { method: 'PUT', body: { amount: 2500 } });
  await darsh(`/investments/${rows[1].id}`, { method: 'DELETE' });
  await darsh('/investments'); // a list request fills in anything missing
  rows = await rowsOf(sip.id);
  assert.equal(rows.length, n - 1, 'deleted month is not filled in again');
  assert.equal(rows[0].amount, 2500);
  assert.equal(rows[0].auto, 0, 'edited month is now a normal entry');

  // Moving the start later removes earlier auto instalments but keeps the edited one.
  await darsh(`/sips/${sip.id}`, { method: 'PUT', body: { start_date: '2025-04-01' } });
  rows = await rowsOf(sip.id);
  assert.equal(rows.filter((r) => r.date < '2025-04-01').map((r) => r.date).join(), '2025-01-10');

  // Moving it earlier fills the extra months.
  await darsh(`/sips/${sip.id}`, { method: 'PUT', body: { start_date: '2024-11-01' } });
  rows = await rowsOf(sip.id);
  assert.ok(rows.some((r) => r.date === '2024-11-10') && rows.some((r) => r.date === '2024-12-10'));
  assert.ok(!rows.some((r) => r.date === '2025-02-10'), 'the skip still holds');

  // Pausing records a stop date; resuming leaves the paused months empty.
  const paused = (await darsh(`/sips/${sip.id}`, { method: 'PUT', body: { active: 0 } })).body;
  assert.equal(paused.end_date, today());
  const resumed = (await darsh(`/sips/${sip.id}`, { method: 'PUT', body: { active: 1 } })).body;
  assert.equal(resumed.end_date, null);

  // A plan entered with a stop date is finished and only covers its months.
  const old = (await darsh('/sips', { method: 'POST', body: { name: 'Old ELSS', amount: 1000, day_of_month: 1, start_date: '2022-04-01', end_date: '2023-03-31' } })).body;
  assert.equal(old.active, 0);
  assert.equal((await rowsOf(old.id)).length, 12);
  assert.equal((await darsh('/sips', { method: 'POST', body: { name: 'Bad', amount: 1, start_date: '2024-05-01', end_date: '2024-01-01' } })).status, 400);

  // Deleting a plan removes what it filled in, keeps what you entered yourself.
  await darsh(`/sips/${sip.id}`, { method: 'DELETE' });
  const left = await db.all("SELECT * FROM investments WHERE name = 'Flexi cap'");
  assert.equal(left.length, 1);
  assert.equal(left[0].amount, 2500);
  assert.equal(left[0].sip_id, null);
});

test('back-filled instalments do not touch a bank balance; new ones do', async () => {
  const bhakti = await login('bhakti', 'bhakti123');
  const acc = (await bhakti('/accounts', { method: 'POST', body: { name: 'SBI', balance: 100000 } })).body;
  const sip = (await bhakti('/sips', { method: 'POST', body: { name: 'Gold ETF', amount: 3000, day_of_month: 1, start_date: '2024-01-01', bank_account_id: acc.id } })).body;
  assert.ok((await rowsOf(sip.id)).length > 20);
  const balance = (await bhakti('/accounts/overview')).body.find((a) => a.id === acc.id).current_balance;
  assert.equal(balance, 100000, 'past instalments were already in the balance you entered');
  // Today's instalment (logged after the balance was entered) does come off.
  await db.run('INSERT INTO investments (user_id, sip_id, date, name, amount, bank_account_id, auto) VALUES (?, ?, ?, ?, ?, ?, 1)', sip.user_id, sip.id, today(), 'Gold ETF', 3000, acc.id);
  assert.equal((await bhakti('/accounts/overview')).body.find((a) => a.id === acc.id).current_balance, 97000);
});

test('total invested includes what your stocks cost', async () => {
  const bhakti = await login('bhakti', 'bhakti123');
  const before = (await bhakti('/insights/summary')).body;
  await bhakti('/holdings', { method: 'POST', body: { symbol: 'TCS', quantity: 10, avg_price: 3500 } });
  const s = (await bhakti('/insights/summary')).body;
  assert.equal(s.totalInvestedAllTime, before.totalInvestedAllTime + 35000);
  assert.equal(s.investByType.find((r) => r.key === 'Stocks').total, 35000);
  const sumByType = s.investByType.reduce((t, r) => t + r.total, 0);
  assert.equal(sumByType, s.totalInvestedAllTime, 'allocation chart adds up to the total');
});
