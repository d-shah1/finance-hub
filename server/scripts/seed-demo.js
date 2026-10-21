// Fills the database with ~3 months of realistic sample data for Darsh and Bhakti.
// Usage: npm run demo   (uses DB_PATH, so point it at a throwaway file if you want to keep your real data clean)
import { db, init } from '../db.js';
import { stampBalance } from '../lib/accounts.js';
import { fillPlan } from '../lib/sips.js';
import { addDays, nowParts, pad } from '../lib/dates.js';

await init();
const users = await db.all("SELECT * FROM users WHERE role = 'user'");
const now = nowParts();
const todayIso = now.date;

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rand() * a.length)];

const SPENDS = [
  ['Food & Dining', ['Swiggy', 'Zomato', 'Cafe Coffee Day', 'Haldiram'], 150, 900, 0],
  ['Groceries', ['DMart', 'BigBasket', 'Blinkit', 'Local kirana'], 200, 2500, 1],
  ['Transport', ['Uber', 'Ola', 'Rapido', 'Metro card'], 60, 450, 1],
  ['Fuel', ['HP Petrol', 'Indian Oil'], 500, 2000, 1],
  ['Shopping', ['Amazon', 'Myntra', 'Flipkart', 'Decathlon'], 400, 4000, 0],
  ['Entertainment', ['PVR', 'BookMyShow', 'Steam'], 250, 1200, 0],
  ['Subscriptions', ['Netflix', 'Spotify', 'YouTube Premium'], 129, 649, 0],
  ['Health', ['Apollo Pharmacy', 'Practo'], 150, 1500, 1],
  ['Personal Care', ['Salon', 'Nykaa'], 200, 1500, 0],
];

for (const u of users) {
  const has = (await db.get('SELECT COUNT(*) AS n FROM expenses WHERE user_id = ?', u.id)).n;
  if (has) continue;
  const salary = u.username === 'darsh' ? 95000 : 78000;
  const card1 = (await db.run('INSERT INTO cards (user_id, name, bank, last4, credit_limit, statement_day, due_day, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', u.id, u.username === 'darsh' ? 'HDFC Millennia' : 'Axis Ace', u.username === 'darsh' ? 'HDFC Bank' : 'Axis Bank', u.username === 'darsh' ? '4821' : '7730', 150000, 5, 23, '#2a78d6')).lastInsertRowid;
  const card2 = (await db.run('INSERT INTO cards (user_id, name, bank, last4, credit_limit, statement_day, due_day, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', u.id, u.username === 'darsh' ? 'Amazon Pay ICICI' : 'SBI SimplyCLICK', u.username === 'darsh' ? 'ICICI Bank' : 'SBI Card', '1093', 90000, 18, 6, '#6250d6')).lastInsertRowid;

  const ins = { run: (...a) => db.run('INSERT INTO expenses (user_id, date, amount, category, payment_mode, card_id, upi_app, merchant, description, is_need) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...a) };
  for (let back = 95; back >= 0; back--) {
    const date = addDays(todayIso, -back);
    const [y, m, d] = date.split('-').map(Number);
    if (d === 1) {
      await db.run('INSERT INTO income (user_id, date, amount, source, type) VALUES (?, ?, ?, ?, ?)', u.id, date, salary, u.username === 'darsh' ? 'Infosys Ltd' : 'Deloitte', 'Salary');
      await ins.run(u.id, date, u.username === 'darsh' ? 22000 : 18000, 'Rent', 'UPI', null, 'Bank App', 'Landlord', `Rent ${y}-${pad(m)}`, 1);
      await ins.run(u.id, date, 1850, 'Bills & Utilities', 'UPI', null, 'PhonePe', 'Electricity + WiFi', null, 1);
    }
    if (d === 15 && rand() > 0.5) {
      await db.run('INSERT INTO income (user_id, date, amount, source, type) VALUES (?, ?, ?, ?, ?)', u.id, date, Math.round(5000 + rand() * 15000), 'Freelance project', 'Freelance');
    }
    const n = back === 0 ? 0 : Math.floor(rand() * 3) + (rand() > 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const [cat, merchants, lo, hi, need] = pick(SPENDS);
      const r = rand();
      const mode = r < 0.55 ? 'UPI' : r < 0.85 ? 'Card' : 'Cash';
      await ins.run(u.id, date, Math.round(lo + rand() * (hi - lo)), cat, mode, mode === 'Card' ? (rand() > 0.4 ? card1 : card2) : null, mode === 'UPI' ? pick(['GPay', 'PhonePe', 'Paytm']) : null, pick(merchants), null, need);
    }
  }

  // A bank account whose balance was entered today, so new linked entries move it.
  const stamp = {};
  await stampBalance(stamp);
  await db.run(
    'INSERT INTO bank_accounts (user_id, name, bank, account_type, last4, balance, balance_set_at, balance_set_date, balance_anchor, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    u.id, u.username === 'darsh' ? 'HDFC Salary' : 'SBI Savings', u.username === 'darsh' ? 'HDFC Bank' : 'State Bank of India', 'Salary',
    u.username === 'darsh' ? '7781' : '2209', u.username === 'darsh' ? 184250 : 96400, stamp.balance_set_at, stamp.balance_set_date, stamp.balance_anchor,
    u.username === 'darsh' ? '#1baf7a' : '#2a78d6'
  );

  const sips = u.username === 'darsh'
    ? [['Nifty 50 Index Fund', 'Mutual Fund', 8000, 5, 'Groww', 3], ['Parag Parikh Flexi Cap', 'Mutual Fund', 5000, 10, 'Groww', 2], ['PPF', 'PPF', 3000, 25, 'SBI', 1.5]]
    : [['UTI Nifty Next 50', 'Mutual Fund', 6000, 7, 'Kuvera', 2.5], ['Gold ETF', 'Gold', 2000, 12, 'Zerodha', 1]];
  // SIPs running for a few years; their past instalments are filled in automatically.
  for (const [name, type, amount, day, platform, yearsAgo] of sips) {
    const start = addDays(todayIso, -Math.round(yearsAgo * 365));
    const { lastInsertRowid } = await db.run(
      'INSERT INTO sips (user_id, name, type, amount, day_of_month, platform, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      u.id, name, type, amount, day, platform, start
    );
    await fillPlan(await db.get('SELECT * FROM sips WHERE id = ?', lastInsertRowid), todayIso);
  }
  const stocks = u.username === 'darsh'
    ? [['INFY', 'Infosys', 25, 1420, 1512], ['HDFCBANK', 'HDFC Bank', 30, 1580, 1702], ['TATAMOTORS', 'Tata Motors', 40, 980, 812], ['ITC', 'ITC', 100, 410, 436]]
    : [['TCS', 'Tata Consultancy', 8, 3650, 3420], ['ASIANPAINT', 'Asian Paints', 12, 2900, 3105]];
  for (const [symbol, name, q, avg, cur] of stocks) {
    await db.run('INSERT INTO holdings (user_id, symbol, name, exchange, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?)', u.id, symbol, name, 'NSE', q, avg, cur);
  }
  console.log(`Added demo data for ${u.name}`);
}
