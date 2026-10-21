import { db } from '../db.js';
import { monthRange, nowParts, pad, shiftMonth } from './dates.js';
import { cardsOverview } from '../routes/cards.js';
import { accountsOverview } from './accounts.js';
import { fillAllPlans } from './sips.js';

const round = (n) => Math.round(n);
const pct = (a, b) => (b > 0 ? a / b : 0);

// Share of income above which a discretionary category is worth flagging.
const CATEGORY_LIMITS = {
  'Food & Dining': 0.12,
  Shopping: 0.1,
  Entertainment: 0.06,
  Subscriptions: 0.03,
  Travel: 0.1,
  'Personal Care': 0.05,
};

const WANT_CATEGORIES = new Set(['Food & Dining', 'Shopping', 'Entertainment', 'Subscriptions', 'Travel', 'Personal Care', 'Gifts & Donations']);

async function sum(table, uid, from, to, extra = '') {
  const where = uid !== null ? 'user_id = ? AND' : '';
  const params = uid !== null ? [uid, from, to] : [from, to];
  return (await db.get(`SELECT COALESCE(SUM(amount), 0) AS t FROM ${table} WHERE ${where} date BETWEEN ? AND ? ${extra}`, ...params)).t;
}

function groupBy(column, uid, from, to) {
  const where = uid !== null ? 'user_id = ? AND' : '';
  const params = uid !== null ? [uid, from, to] : [from, to];
  return db.all(
    `SELECT ${column} AS key, SUM(amount) AS total, COUNT(*) AS count FROM expenses
     WHERE ${where} date BETWEEN ? AND ? GROUP BY ${column} ORDER BY total DESC`,
    ...params
  );
}

/** Collects the numbers the dashboard and the AI advisor work from. uid null = everyone. */
export async function buildSummary(uid, month) {
  await fillAllPlans(uid); // SIP instalments that came due count towards every total below
  const now = nowParts();
  const ym = month || `${now.year}-${pad(now.month)}`;
  const { from, to } = monthRange(ym);
  const own = uid !== null ? [uid] : [];
  const uw = uid !== null ? 'WHERE e.user_id = ? AND' : 'WHERE';
  const uwParams = uid !== null ? [uid, from, to] : [from, to];

  const months = [5, 4, 3, 2, 1, 0].map((i) => shiftMonth(ym, -i));
  // Independent queries run in parallel: each is a network round-trip on a hosted database.
  const [trend, income, expenses, invested, wants, byCategory, byMode, topMerchants, daily, holdingRows, sips, allTime, investByType, cards, budgetRow, accounts] =
    await Promise.all([
      Promise.all(
        months.map(async (m) => {
          const r = monthRange(m);
          const [inc, exp, inv] = await Promise.all([sum('income', uid, r.from, r.to), sum('expenses', uid, r.from, r.to), sum('investments', uid, r.from, r.to)]);
          return { month: m, income: inc, expenses: exp, investments: inv };
        })
      ),
      sum('income', uid, from, to),
      sum('expenses', uid, from, to),
      sum('investments', uid, from, to),
      sum('expenses', uid, from, to, 'AND is_need = 0'),
      groupBy('category', uid, from, to),
      groupBy('payment_mode', uid, from, to),
      db.all(
        `SELECT merchant AS key, SUM(amount) AS total, COUNT(*) AS count FROM expenses e
         ${uw} date BETWEEN ? AND ? AND merchant IS NOT NULL AND merchant != ''
         GROUP BY merchant COLLATE NOCASE ORDER BY total DESC LIMIT 5`,
        ...uwParams
      ),
      db.all(`SELECT date, SUM(amount) AS total FROM expenses e ${uw} date BETWEEN ? AND ? GROUP BY date ORDER BY date`, ...uwParams),
      db.all(`SELECT * FROM holdings ${uid !== null ? 'WHERE user_id = ?' : ''}`, ...own),
      db.all(`SELECT name, type, amount FROM sips WHERE active = 1 ${uid !== null ? 'AND user_id = ?' : ''}`, ...own),
      db.get(`SELECT COALESCE(SUM(amount), 0) AS t FROM investments ${uid !== null ? 'WHERE user_id = ?' : ''}`, ...own),
      db.all(`SELECT type AS key, SUM(amount) AS total FROM investments ${uid !== null ? 'WHERE user_id = ?' : ''} GROUP BY type ORDER BY total DESC`, ...own),
      cardsOverview(uid),
      uid !== null ? db.get('SELECT monthly_budget FROM users WHERE id = ?', uid) : null,
      accountsOverview(uid),
    ]);

  const recent = trend.slice(-3);
  const withIncome = recent.filter((t) => t.income > 0);
  const avgIncome = withIncome.length ? withIncome.reduce((s, t) => s + t.income, 0) / withIncome.length : 0;
  const withSpend = recent.filter((t) => t.expenses > 0);
  const avgExpenses = withSpend.length ? withSpend.reduce((s, t) => s + t.expenses, 0) / withSpend.length : 0;

  const holdings = holdingRows.map((h) => {
    const cost = h.quantity * h.avg_price;
    const value = h.quantity * (h.current_price ?? h.avg_price);
    return { symbol: h.symbol, cost, value, pnl: value - cost, sector: h.sector };
  });
  const portfolioCost = holdings.reduce((s, h) => s + h.cost, 0);
  const portfolioValue = holdings.reduce((s, h) => s + h.value, 0);

  return {
    month: ym,
    income,
    expenses,
    invested,
    wants,
    needs: expenses - wants,
    net: income - expenses - invested,
    savingsRate: pct(income - expenses, income),
    avgIncome,
    avgExpenses,
    budget: budgetRow?.monthly_budget ?? null,
    bank: (() => {
      const active = accounts.filter((a) => a.active);
      return { count: active.length, balance: active.reduce((t, a) => t + a.current_balance, 0) };
    })(),
    trend,
    byCategory,
    byMode,
    topMerchants,
    daily,
    sips,
    sipMonthly: sips.reduce((s, x) => s + x.amount, 0),
    // Money put in: SIPs and other investments, plus what the stocks you hold cost.
    totalInvestedAllTime: allTime.t + portfolioCost,
    contributions: allTime.t,
    investByType: (() => {
      const rows = investByType.map((r) => ({ ...r }));
      if (portfolioCost > 0) {
        const stocks = rows.find((r) => r.key === 'Stocks');
        if (stocks) stocks.total += portfolioCost;
        else rows.push({ key: 'Stocks', total: portfolioCost });
      }
      return rows.sort((a, b) => b.total - a.total);
    })(),
    portfolio: {
      cost: portfolioCost,
      value: portfolioValue,
      pnl: portfolioValue - portfolioCost,
      count: holdings.length,
      largest: holdings.sort((a, b) => b.value - a.value)[0] || null,
    },
    cards: cards.map((c) => ({
      name: c.name,
      status: c.status,
      due_date: c.cycle.due_date,
      days_to_due: c.cycle.days_to_due,
      billed: c.billed_amount,
      unbilled: c.unbilled_amount,
      utilisation: c.utilisation,
    })),
  };
}

/** Deterministic, explainable advice. Works with no AI provider configured. */
export function ruleBasedAdvice(s) {
  const recs = [];
  const income = s.income || s.avgIncome;
  const spend = s.expenses || s.avgExpenses;

  if (!income) {
    recs.push({
      level: 'info',
      title: 'Add your earnings',
      detail: 'Log your salary or other income for this month so savings and investment targets can be calculated.',
    });
  }

  const surplus = Math.max(0, income - spend);
  const twentyPct = income * 0.2;
  const suggestedInvest = income ? round(Math.min(Math.max(twentyPct, surplus * 0.7), surplus || twentyPct)) : 0;
  const emergencyTarget = round((s.avgExpenses || spend) * 6);

  if (income) {
    const rate = pct(income - spend, income);
    if (rate < 0) {
      recs.push({
        level: 'critical',
        title: 'Spending is above income',
        detail: `You have spent ₹${round(spend - income).toLocaleString('en-IN')} more than you earned. Pause new discretionary purchases and review the biggest categories below.`,
      });
    } else if (rate < 0.2) {
      recs.push({
        level: 'warning',
        title: `Savings rate is ${(rate * 100).toFixed(0)}%`,
        detail: 'Aim to keep at least 20% of income aside every month (the 50/30/20 rule: 50% needs, 30% wants, 20% savings and investments).',
      });
    } else {
      recs.push({
        level: 'good',
        title: `Healthy savings rate of ${(rate * 100).toFixed(0)}%`,
        detail: 'You are saving more than the recommended 20%. Make sure the surplus is actually invested, not left idle in a savings account.',
      });
    }

    recs.push({
      level: 'info',
      title: `Invest about ₹${suggestedInvest.toLocaleString('en-IN')} a month`,
      detail:
        `Based on income of ₹${round(income).toLocaleString('en-IN')} and spending of ₹${round(spend).toLocaleString('en-IN')}. ` +
        (s.sipMonthly
          ? `Your active SIPs total ₹${round(s.sipMonthly).toLocaleString('en-IN')}/month` +
            (s.sipMonthly < suggestedInvest ? `, so there is room to add ₹${round(suggestedInvest - s.sipMonthly).toLocaleString('en-IN')} more.` : ', which already meets this target.')
          : 'Setting it up as an automatic SIP on salary day makes it effortless.'),
    });

    const wantsShare = pct(s.wants, income);
    if (wantsShare > 0.3) {
      recs.push({
        level: 'warning',
        title: `Wants are ${(wantsShare * 100).toFixed(0)}% of income`,
        detail: 'Expenses marked as "want" are above the 30% guideline. Trimming them is the fastest way to raise your investments.',
      });
    }

    for (const c of s.byCategory) {
      const limit = CATEGORY_LIMITS[c.key];
      if (limit && c.total / income > limit) {
        recs.push({
          level: 'warning',
          title: `${c.key} is ${((c.total / income) * 100).toFixed(0)}% of income`,
          detail: `₹${round(c.total).toLocaleString('en-IN')} across ${c.count} transactions. A comfortable ceiling is about ${(limit * 100).toFixed(0)}% (₹${round(income * limit).toLocaleString('en-IN')}).`,
        });
      }
    }
  }

  if (s.bank?.count && spend) {
    const months = s.bank.balance / (s.avgExpenses || spend);
    recs.push({
      level: months >= 6 ? 'good' : months >= 3 ? 'info' : 'warning',
      title: `Bank balance covers ${months.toFixed(1)} months of spending`,
      detail:
        months >= 6
          ? `₹${round(s.bank.balance).toLocaleString('en-IN')} across your accounts is a full emergency fund. Money beyond ₹${emergencyTarget.toLocaleString('en-IN')} could be invested instead of sitting idle.`
          : `₹${round(s.bank.balance).toLocaleString('en-IN')} across your accounts. Aim for about six months (₹${emergencyTarget.toLocaleString('en-IN')}) before taking on higher-risk investments.`,
    });
  } else {
    recs.push({
      level: 'info',
      title: `Emergency fund target: ₹${emergencyTarget.toLocaleString('en-IN')}`,
      detail: 'Keep about six months of expenses in a liquid fund or sweep FD before taking on higher-risk investments.',
    });
  }

  if (s.budget && s.expenses > s.budget) {
    recs.push({
      level: 'warning',
      title: 'Monthly budget exceeded',
      detail: `Spent ₹${round(s.expenses).toLocaleString('en-IN')} against a budget of ₹${round(s.budget).toLocaleString('en-IN')}.`,
    });
  }

  for (const c of s.cards) {
    if (c.status === 'overdue') {
      recs.push({ level: 'critical', title: `${c.name} bill is overdue`, detail: 'Pay it now to avoid late fees and 36-45% annual interest. Always pay the full amount, not the minimum due.' });
    } else if (c.status === 'due-soon') {
      recs.push({ level: 'warning', title: `${c.name} bill due in ${c.days_to_due} day(s)`, detail: `Due on ${c.due_date}. Billed amount: ₹${round(c.billed).toLocaleString('en-IN')}.` });
    }
    if (c.utilisation && c.utilisation > 0.3) {
      recs.push({ level: 'warning', title: `${c.name} utilisation at ${(c.utilisation * 100).toFixed(0)}%`, detail: 'Keeping card usage under 30% of the limit helps your credit score.' });
    }
  }

  const cash = s.byMode.find((m) => m.key === 'Cash');
  if (cash && s.expenses && cash.total / s.expenses > 0.4) {
    recs.push({ level: 'info', title: 'Lots of cash spending', detail: 'Cash is easy to lose track of. Log cash expenses the same day, or switch small payments to UPI so they are recorded.' });
  }

  const p = s.portfolio;
  if (p.count && p.largest && p.value && p.largest.value / p.value > 0.25 && p.count > 1) {
    recs.push({
      level: 'warning',
      title: `${p.largest.symbol} is ${((p.largest.value / p.value) * 100).toFixed(0)}% of your stocks`,
      detail: 'A single stock above 25% of the portfolio is concentrated risk. Consider diversifying through index funds.',
    });
  }

  const allocation = income
    ? [
        { bucket: 'Equity mutual funds / index SIPs', share: 0.6 },
        { bucket: 'Debt (PPF, EPF/VPF, FDs, debt funds)', share: 0.25 },
        { bucket: 'Gold (SGB / gold ETF)', share: 0.1 },
        { bucket: 'Direct stocks', share: 0.05 },
      ].map((a) => ({ ...a, amount: round(suggestedInvest * a.share) }))
    : [];

  return {
    suggestedInvest,
    emergencyTarget,
    budgetSplit: income ? { needs: round(income * 0.5), wants: round(income * 0.3), invest: round(income * 0.2) } : null,
    allocation,
    recommendations: recs,
  };
}
