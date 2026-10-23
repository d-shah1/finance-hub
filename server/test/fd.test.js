import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const { init, db } = await import('../db.js');
const { createApp } = await import('../app.js');
const { fdFigures, maturityDate } = await import('../lib/fd.js');
const { tick } = await import('../lib/scheduler.js');
const { addDays, today } = await import('../lib/dates.js');

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
const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test('maturity dates and interest match standard FD maths', () => {
  assert.equal(maturityDate('2026-01-31', 1, 0), '2026-02-28');
  assert.equal(maturityDate('2026-01-01', 0, 45), '2026-02-15');
  assert.equal(maturityDate('2026-01-01', 12, 0), '2027-01-01');

  const base = { principal: 100000, rate: 7, start_date: '2026-01-01', maturity_date: '2027-01-01', compounding: 'quarterly', payout: 'cumulative' };
  // ₹1 lakh at 7% compounded quarterly for a year: 1,00,000 x 1.0175^4.
  near(fdFigures(base, '2026-06-01').maturity_amount, 100000 * 1.0175 ** 4);
  // Half-way value, and capped at maturity afterwards.
  near(fdFigures(base, '2026-07-02').value_today, 100000 * 1.0175 ** (4 * (182 / 365)));
  assert.equal(fdFigures(base, '2027-06-01').status, 'matured');

  // Under 6 months: simple interest.
  const short = { ...base, maturity_date: '2026-04-01' };
  near(fdFigures(short, '2026-03-01').maturity_amount, 100000 * (1 + 0.07 * (90 / 365)));

  // Interest-payout FD: value stays at principal, interest is paid out along the way.
  const payout = { ...base, payout: 'quarterly' };
  const p = fdFigures(payout, '2026-07-02');
  assert.equal(p.value_today, 100000);
  assert.equal(p.maturity_amount, 100000);
  near(p.total_interest, 7000);
  near(p.interest_so_far, 100000 * 0.07 * (182 / 365));
});

test('FDs: create, validate, count in totals, and debit the bank account', async () => {
  const darsh = await login('darsh', 'darsh123');
  const acc = (await darsh('/accounts', { method: 'POST', body: { name: 'HDFC', balance: 300000 } })).body;
  const t = today();
  const created = await darsh('/fds', {
    method: 'POST',
    body: { bank: 'SBI', principal: 100000, rate: 7.1, start_date: t, tenure_months: 12, bank_account_id: acc.id },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.maturity_date, maturityDate(t, 12, 0));
  assert.equal((await darsh('/fds', { method: 'POST', body: { bank: 'X', principal: 1, rate: 7, start_date: t, tenure_months: 0, tenure_days: 3 } })).status, 400);

  const [fd] = (await darsh('/fds/overview')).body;
  assert.equal(fd.status, 'active');
  assert.ok(fd.maturity_amount > 107000 && fd.maturity_amount < 107400);

  const bal = (await darsh('/accounts/overview')).body.find((a) => a.id === acc.id).current_balance;
  assert.equal(bal, 200000, 'opening the FD took the money out');

  const s = (await darsh('/insights/summary')).body;
  assert.equal(s.fd.count, 1);
  assert.equal(s.fd.invested, 100000);
  assert.equal(s.totalInvestedAllTime, 100000);
  assert.ok(Math.abs(s.currentValue - fd.value_today) < 1e-6);
  assert.equal(s.investByType.find((r) => r.key === 'FD').total, 100000);
});

test('maturity pays back into the account; renew rolls it over; close early and reopen', async () => {
  const bhakti = await login('bhakti', 'bhakti123');
  const acc = (await bhakti('/accounts', { method: 'POST', body: { name: 'SBI', balance: 50000 } })).body;
  // Balance entered a year ago; an FD from back then has now matured.
  const yearAgo = addDays(today(), -400);
  await db.run('UPDATE bank_accounts SET balance_set_date = ?, balance_anchor = ? WHERE id = ?', yearAgo, JSON.stringify({ expenses: 0, investments: 0, income: 0, fixed_deposits: 0 }), acc.id);
  const old = (await bhakti('/fds', { method: 'POST', body: { bank: 'ICICI', principal: 20000, rate: 7, start_date: addDays(yearAgo, 1), tenure_months: 12, bank_account_id: acc.id } })).body;
  let [fd] = (await bhakti('/fds/overview')).body;
  assert.equal(fd.status, 'matured');
  let balance = (await bhakti('/accounts/overview')).body.find((a) => a.id === acc.id).current_balance;
  near(balance, 50000 - 20000 + fd.maturity_amount, 0.01);

  // The overview's figures must not clobber the stored tenure (a renewal reads it back).
  assert.equal(fd.tenure_months, 12);
  assert.equal(fd.tenure_days, 0);
  // Renewing moves the maturity amount into a new FD; no cash comes back to the account.
  // Sent the way the app does: the tenure as read from the overview.
  const renewed = (await bhakti(`/fds/${old.id}/renew`, { method: 'POST', body: { rate: 6.8, tenure_months: fd.tenure_months, tenure_days: fd.tenure_days } })).body;
  assert.equal(renewed.maturity_date, maturityDate(old.maturity_date, 12, 0), 'same 12-month term again');
  near(renewed.principal, fd.maturity_amount, 0.01);
  assert.equal(renewed.start_date, old.maturity_date);
  assert.equal(renewed.rate, 6.8);
  balance = (await bhakti('/accounts/overview')).body.find((a) => a.id === acc.id).current_balance;
  near(balance, 30000, 0.01);

  // Reopen undoes the renewal.
  await bhakti(`/fds/${old.id}/reopen`, { method: 'POST' });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM fixed_deposits WHERE renewed_from = ?', old.id)).n, 0);

  // Close another FD early: the amount received is credited.
  const early = (await bhakti('/fds', { method: 'POST', body: { bank: 'Axis', principal: 10000, rate: 7, start_date: addDays(today(), -30), tenure_months: 24, bank_account_id: acc.id } })).body;
  const closed = (await bhakti(`/fds/${early.id}/close`, { method: 'POST', body: { closed_on: addDays(today(), -1), close_amount: 10050 } })).body;
  assert.equal(closed.status, 'closed');
  assert.equal(closed.value_today, 10050);
  const s = (await bhakti('/insights/summary')).body;
  assert.equal(s.fd.count, 0, 'matured and closed FDs no longer count as running');
});

test('reminder the day before maturity, and auto-renew on the day', async () => {
  const admin = await login('admin', 'admin123');
  const made = (await admin('/users', { method: 'POST', body: { username: 'fdrem', name: 'FD', password: 'fdrem123' } })).body;
  const u = await login('fdrem', 'fdrem123');
  const fd = (await u('/fds', { method: 'POST', body: { bank: 'Kotak', principal: 5000, rate: 7, start_date: '2026-01-10', tenure_months: 12, auto_renew: 1 } })).body;
  assert.equal(fd.maturity_date, '2027-01-10');
  await tick(new Date('2027-01-09T04:00:00Z'), { job: 'morning' });
  assert.ok(await db.get('SELECT 1 FROM sent_notifications WHERE key = ?', `fd:${fd.id}:2027-01-10`));
  await tick(new Date('2027-01-10T04:00:00Z'), { job: 'morning' });
  const next = await db.get('SELECT * FROM fixed_deposits WHERE renewed_from = ?', fd.id);
  assert.ok(next, 'renewed automatically');
  assert.equal(next.start_date, '2027-01-10');
  assert.equal(next.maturity_date, '2028-01-10');
  await admin(`/users/${made.id}`, { method: 'DELETE' });
});
