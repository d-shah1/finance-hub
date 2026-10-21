import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const { init, db } = await import('../db.js');
const { createApp } = await import('../app.js');
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

const balanceOf = async (as, id) => (await as('/accounts/overview')).body.find((a) => a.id === id).current_balance;

test('balances follow linked expenses, investments and earnings', async () => {
  const darsh = await login('darsh', 'darsh123');
  const acc = (await darsh('/accounts', { method: 'POST', body: { name: 'HDFC Savings', bank: 'HDFC Bank', balance: 50000 } })).body;
  assert.equal(await balanceOf(darsh, acc.id), 50000);

  const t = today();
  const upi = (await darsh('/expenses', { method: 'POST', body: { date: t, amount: 1000, category: 'Groceries', payment_mode: 'UPI', bank_account_id: acc.id } })).body;
  assert.equal(upi.bank_account_id, acc.id);
  await darsh('/investments', { method: 'POST', body: { date: t, name: 'Nifty 50', amount: 5000, bank_account_id: acc.id } });
  await darsh('/income', { method: 'POST', body: { date: t, amount: 20000, source: 'Freelance', bank_account_id: acc.id } });
  assert.equal(await balanceOf(darsh, acc.id), 50000 - 1000 - 5000 + 20000);

  // A back-dated entry logged now is assumed to be in the balance already entered.
  await darsh('/expenses', { method: 'POST', body: { date: addDays(t, -3), amount: 700, category: 'Fuel', payment_mode: 'UPI', bank_account_id: acc.id } });
  assert.equal(await balanceOf(darsh, acc.id), 64000);

  // Editing and deleting are reflected.
  await darsh(`/expenses/${upi.id}`, { method: 'PUT', body: { amount: 1500 } });
  assert.equal(await balanceOf(darsh, acc.id), 63500);
  await darsh(`/expenses/${upi.id}`, { method: 'DELETE' });
  assert.equal(await balanceOf(darsh, acc.id), 65000);

  // Entering a new balance restarts the count from there; editing the name keeps the shown balance.
  await darsh(`/accounts/${acc.id}`, { method: 'PUT', body: { balance: 61000 } });
  assert.equal(await balanceOf(darsh, acc.id), 61000);
  await darsh('/expenses', { method: 'POST', body: { date: t, amount: 1000, category: 'Shopping', payment_mode: 'UPI', bank_account_id: acc.id } });
  const shown = await balanceOf(darsh, acc.id);
  await darsh(`/accounts/${acc.id}`, { method: 'PUT', body: { name: 'HDFC Salary', balance: shown } });
  assert.equal(await balanceOf(darsh, acc.id), 60000);
});

test('payment mode decides whether a bank account applies', async () => {
  const darsh = await login('darsh', 'darsh123');
  const acc = (await darsh('/accounts', { method: 'POST', body: { name: 'ICICI', balance: 1000 } })).body;
  const card = (await darsh('/cards', { method: 'POST', body: { name: 'Credit', statement_day: 1, due_day: 20 } })).body;
  const t = today();
  const cash = (await darsh('/expenses', { method: 'POST', body: { date: t, amount: 10, category: 'Other', payment_mode: 'Cash', bank_account_id: acc.id } })).body;
  assert.equal(cash.bank_account_id, null, 'cash never touches the bank');
  const credit = (await darsh('/expenses', { method: 'POST', body: { date: t, amount: 10, category: 'Other', payment_mode: 'Card', card_id: card.id, bank_account_id: acc.id } })).body;
  assert.equal(credit.bank_account_id, null, 'credit card is paid off later, not debited now');
  const debit = (await darsh('/expenses', { method: 'POST', body: { date: t, amount: 10, category: 'Other', payment_mode: 'Card', bank_account_id: acc.id } })).body;
  assert.equal(debit.bank_account_id, acc.id, 'debit card comes out of the account');
  assert.equal(debit.card_id, null);
});

test('accounts are private and SIP instalments carry their account', async () => {
  const darsh = await login('darsh', 'darsh123');
  const bhakti = await login('bhakti', 'bhakti123');
  const admin = await login('admin', 'admin123');
  const acc = (await darsh('/accounts', { method: 'POST', body: { name: 'SBI', balance: 9000 } })).body;

  assert.equal((await bhakti('/accounts')).body.length, 0);
  const steal = await bhakti('/expenses', { method: 'POST', body: { date: today(), amount: 5, category: 'Other', payment_mode: 'UPI', bank_account_id: acc.id } });
  assert.equal(steal.status, 400);
  assert.ok((await admin('/accounts/overview')).body.some((a) => a.id === acc.id && a.user_name === 'Darsh'));

  const sip = (await darsh('/sips', { method: 'POST', body: { name: 'Flexi cap', amount: 2000, day_of_month: 1, bank_account_id: acc.id } })).body;
  const logged = (await darsh(`/sips/${sip.id}/log`, { method: 'POST', body: { date: today() } })).body;
  assert.equal(logged.bank_account_id, acc.id);
  assert.equal(await balanceOf(darsh, acc.id), 7000);

  // Deleting an account keeps the transactions, just unlinked.
  await darsh(`/accounts/${acc.id}`, { method: 'DELETE' });
  assert.equal((await db.get('SELECT bank_account_id FROM investments WHERE id = ?', logged.id)).bank_account_id, null);
  assert.equal((await db.get('SELECT bank_account_id FROM sips WHERE id = ?', sip.id)).bank_account_id, null);

  const summary = (await darsh('/insights/summary')).body;
  assert.ok(summary.bank && typeof summary.bank.balance === 'number');
});
