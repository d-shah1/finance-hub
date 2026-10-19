import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.CRON_SECRET = 'cron-test';

const { init, db } = await import('../db.js');
const { createApp } = await import('../app.js');
const { cardCycle } = await import('../lib/cards.js');
const { tick } = await import('../lib/scheduler.js');

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
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (path, opts = {}) => {
    const r = await fetch(base + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', cookie },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };
}

test('rejects bad credentials and unauthenticated access', async () => {
  const bad = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'darsh', password: 'nope' }),
  });
  assert.equal(bad.status, 401);
  assert.equal((await fetch(`${base}/expenses`)).status, 401);
});

test('users only see their own data; admin sees everyone', async () => {
  const darsh = await login('darsh', 'darsh123');
  const bhakti = await login('bhakti', 'bhakti123');
  const admin = await login('admin', 'admin123');

  const card = await darsh('/cards', { method: 'POST', body: { name: 'HDFC Millennia', statement_day: 5, due_day: 25, credit_limit: 100000 } });
  assert.equal(card.status, 201);

  const e1 = await darsh('/expenses', {
    method: 'POST',
    body: { date: '2026-10-10', amount: 450, category: 'Food & Dining', payment_mode: 'Card', card_id: card.body.id, merchant: 'Swiggy', upi_app: 'GPay' },
  });
  assert.equal(e1.status, 201);
  assert.equal(e1.body.upi_app, null, 'UPI app is cleared for card payments');

  const e2 = await bhakti('/expenses', { method: 'POST', body: { date: '2026-10-10', amount: 120, category: 'Transport', payment_mode: 'UPI', upi_app: 'PhonePe' } });
  assert.equal(e2.status, 201);

  // Bhakti cannot use or edit Darsh's card / expense.
  const steal = await bhakti('/expenses', { method: 'POST', body: { date: '2026-10-10', amount: 1, category: 'Other', payment_mode: 'Card', card_id: card.body.id } });
  assert.equal(steal.status, 400);
  assert.equal((await bhakti(`/expenses/${e1.body.id}`, { method: 'DELETE' })).status, 404);

  assert.equal((await darsh('/expenses')).body.length, 1);
  assert.equal((await bhakti('/expenses')).body.length, 1);
  assert.equal((await darsh('/expenses?userId=all')).body.length, 1, 'userId param is ignored for non-admins');
  assert.equal((await admin('/expenses')).body.length, 2);
  assert.equal((await admin(`/expenses?userId=${e2.body.user_id}`)).body.length, 1);
  assert.equal((await darsh('/users')).status, 403);
  assert.equal((await admin('/users')).body.length, 3);
});

test('validation errors are reported', async () => {
  const darsh = await login('darsh', 'darsh123');
  const r = await darsh('/expenses', { method: 'POST', body: { date: '10/10/2026', amount: 5, category: 'Other', payment_mode: 'Cash' } });
  assert.equal(r.status, 400);
  const r2 = await darsh('/expenses', { method: 'POST', body: { date: '2026-10-10', amount: 5, category: 'Other', payment_mode: 'Cheque' } });
  assert.equal(r2.status, 400);
});

test('card billing cycle', () => {
  // Statement on the 5th, due on the 25th of the same month.
  let c = cardCycle({ statement_day: 5, due_day: 25 }, '2026-10-19');
  assert.equal(c.billed_to, '2026-10-05');
  assert.equal(c.billed_from, '2026-09-06');
  assert.equal(c.due_date, '2026-10-25');
  assert.equal(c.days_to_due, 6);
  // Statement on the 20th, due on the 8th of next month; before this month's statement.
  c = cardCycle({ statement_day: 20, due_day: 8 }, '2026-10-19');
  assert.equal(c.billed_to, '2026-09-20');
  assert.equal(c.due_date, '2026-10-08');
  assert.ok(c.days_to_due < 0);
  // Day 31 clamps to short months.
  c = cardCycle({ statement_day: 31, due_day: 20 }, '2026-03-01');
  assert.equal(c.billed_to, '2026-02-28');
  assert.equal(c.due_date, '2026-03-20');
});

test('card overview, payments, SIPs and insights', async () => {
  const darsh = await login('darsh', 'darsh123');
  const overview = await darsh('/cards/overview');
  assert.equal(overview.status, 200);
  const card = overview.body[0];
  assert.ok(card.cycle.due_date);
  const pay = await darsh('/card-payments', { method: 'POST', body: { card_id: card.id, due_date: card.cycle.due_date, amount: 450, paid_on: '2026-10-19' } });
  assert.equal(pay.status, 201);
  assert.equal((await darsh('/cards/overview')).body[0].status, 'paid');

  await darsh('/income', { method: 'POST', body: { date: '2026-10-01', amount: 80000, source: 'Acme Corp', type: 'Salary' } });
  const sip = await darsh('/sips', { method: 'POST', body: { name: 'Nifty 50 Index', amount: 5000, day_of_month: 5 } });
  assert.equal(sip.status, 201);
  const logged = await darsh(`/sips/${sip.body.id}/log`, { method: 'POST', body: {} });
  assert.equal(logged.status, 201);
  const status = await darsh('/sips/status');
  assert.ok(status.body[0].logged_this_month);

  await darsh('/holdings', { method: 'POST', body: { symbol: 'INFY', quantity: 10, avg_price: 1500, current_price: 1650 } });
  const summary = await darsh('/insights/summary?month=2026-10');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.income, 80000);
  assert.equal(summary.body.portfolio.pnl, 1500);
  assert.ok(summary.body.advice.suggestedInvest > 0);
  assert.ok(summary.body.advice.recommendations.length > 0);

  const ai = await darsh('/insights/ai/analyse?month=2026-10', { method: 'POST', body: {} });
  assert.equal(ai.status, 200);
  assert.equal(ai.body.provider, null, 'no AI key configured in tests');
  assert.ok(ai.body.advice);
});

test('daily reminder is only queued once per day', async () => {
  // 21:45 IST on 2026-10-19
  const at = new Date('2026-10-19T16:15:00Z');
  await tick(at);
  await tick(at);
  const rows = await db.all("SELECT key FROM sent_notifications WHERE key LIKE 'daily:%:2026-10-19'");
  assert.equal(rows.length, 3);
});

test('settings and password change', async () => {
  const bhakti = await login('bhakti', 'bhakti123');
  const r = await bhakti('/me', { method: 'PUT', body: { reminder_time: '22:15', monthly_budget: 30000 } });
  assert.equal(r.body.reminder_time, '22:15');
  assert.equal((await bhakti('/me', { method: 'PUT', body: { reminder_time: '25:00' } })).status, 400);
  assert.equal((await bhakti('/me/password', { method: 'POST', body: { current: 'wrong', next: 'newpass1' } })).status, 400);
  assert.equal((await bhakti('/me/password', { method: 'POST', body: { current: 'bhakti123', next: 'newpass1' } })).status, 200);
  await login('bhakti', 'newpass1');
});

test('cron endpoint requires the secret', async () => {
  assert.equal((await fetch(`${base}/cron`)).status, 401);
  assert.equal((await fetch(`${base}/cron?key=wrong`)).status, 401);
  assert.equal((await fetch(`${base}/cron`, { headers: { authorization: 'Bearer cron-test' } })).status, 200);
  assert.equal((await fetch(`${base}/cron?key=cron-test`)).status, 200);
});

test('deleting a card or a person cleans up their rows', async () => {
  const admin = await login('admin', 'admin123');
  const made = await admin('/users', { method: 'POST', body: { username: 'temp', name: 'Temp', password: 'temp1234' } });
  assert.equal(made.status, 201);
  const temp = await login('temp', 'temp1234');
  const card = await temp('/cards', { method: 'POST', body: { name: 'Temp card', statement_day: 1, due_day: 20 } });
  const exp = await temp('/expenses', { method: 'POST', body: { date: '2026-10-10', amount: 99, category: 'Other', payment_mode: 'Card', card_id: card.body.id } });
  await temp('/card-payments', { method: 'POST', body: { card_id: card.body.id, due_date: '2026-10-20', amount: 99, paid_on: '2026-10-19' } });

  assert.equal((await temp(`/cards/${card.body.id}`, { method: 'DELETE' })).status, 200);
  const after = await db.get('SELECT card_id FROM expenses WHERE id = ?', exp.body.id);
  assert.equal(after.card_id, null, 'expense survives with card cleared');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM card_payments WHERE card_id = ?', card.body.id)).n, 0);

  assert.equal((await admin(`/users/${made.body.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM expenses WHERE user_id = ?', made.body.id)).n, 0);
});

test('card and SIP reminders fire only the day before', async () => {
  const admin = await login('admin', 'admin123');
  const made = await admin('/users', { method: 'POST', body: { username: 'remind', name: 'Remind', password: 'remind123' } });
  const u = await login('remind', 'remind123');
  // Statement on the 20th, due on the 5th of the next month.
  const dueTomorrow = await u('/cards', { method: 'POST', body: { name: 'Due 5th', statement_day: 20, due_day: 5 } });
  const dueLater = await u('/cards', { method: 'POST', body: { name: 'Due 7th', statement_day: 20, due_day: 7 } });
  const sipTomorrow = await u('/sips', { method: 'POST', body: { name: 'SIP 5th', amount: 1000, day_of_month: 5 } });
  const sipToday = await u('/sips', { method: 'POST', body: { name: 'SIP 4th', amount: 1000, day_of_month: 4 } });
  const sipMonthEnd = await u('/sips', { method: 'POST', body: { name: 'SIP 31st', amount: 1000, day_of_month: 31 } });

  const sent = async (key) => !!(await db.get('SELECT 1 FROM sent_notifications WHERE key = ?', key));

  // 08:30 IST on 4 Nov: too early for the morning reminders.
  await tick(new Date('2026-11-04T03:00:00Z'));
  assert.equal(await sent(`card:${dueTomorrow.body.id}:2026-11-05`), false);

  // 09:30 IST on 4 Nov.
  await tick(new Date('2026-11-04T04:00:00Z'));
  assert.equal(await sent(`card:${dueTomorrow.body.id}:2026-11-05`), true, 'card due tomorrow');
  assert.equal(await sent(`card:${dueLater.body.id}:2026-11-07`), false, 'card due in 3 days');
  assert.equal(await sent(`sip:${sipTomorrow.body.id}:2026-11-05`), true, 'SIP tomorrow');
  assert.equal(await sent(`sip:${sipToday.body.id}:2026-11-04`), false, 'no same-day SIP reminder');

  // A plan on the 31st is reminded on 29 Nov, since November ends on the 30th.
  await tick(new Date('2026-11-29T04:00:00Z'));
  assert.equal(await sent(`sip:${sipMonthEnd.body.id}:2026-11-30`), true);

  // Already paid early this month: no reminder.
  await u(`/sips/${sipTomorrow.body.id}/log`, { method: 'POST', body: { date: '2026-12-01' } });
  await tick(new Date('2026-12-04T04:00:00Z'));
  assert.equal(await sent(`sip:${sipTomorrow.body.id}:2026-12-05`), false, 'skipped when already logged');

  await admin(`/users/${made.body.id}`, { method: 'DELETE' });
});
