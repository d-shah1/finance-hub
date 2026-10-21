import express from 'express';
import { db } from '../db.js';
import { ah, scopeUserId } from '../lib/auth.js';
import { buildSummary, ruleBasedAdvice } from '../lib/insights.js';
import { activeProvider, complete } from '../lib/llm.js';
import { today } from '../lib/dates.js';

const router = express.Router();

const MONTH_RE = /^\d{4}-\d{2}$/;
const monthParam = (req) => (MONTH_RE.test(req.query.month || '') ? req.query.month : undefined);

router.get('/summary', ah(async (req, res) => {
  const uid = scopeUserId(req);
  const summary = await buildSummary(uid, monthParam(req));
  const { n } = await db.get(
    `SELECT COUNT(*) AS n FROM expenses WHERE date = ? ${uid !== null ? 'AND user_id = ?' : ''}`,
    ...(uid !== null ? [today(), uid] : [today()])
  );
  res.json({ ...summary, todayCount: n, advice: ruleBasedAdvice(summary) });
}));

router.get('/ai/status', (req, res) => {
  res.json({ provider: activeProvider() });
});

router.get('/ai/reports', ah(async (req, res) => {
  const uid = scopeUserId(req) ?? req.user.id;
  res.json(await db.all('SELECT * FROM ai_reports WHERE user_id = ? ORDER BY id DESC LIMIT 10', uid));
}));

const SYSTEM_PROMPT = `You are a friendly, practical personal finance coach for a young earner in India.
You receive a JSON summary of one person's month: income, expenses by category and payment mode (Card/Cash/UPI),
needs vs wants, SIPs and investments, stock holdings, and credit card bills, plus a rule-based baseline.
Write concise, specific advice in Markdown using Indian Rupees (₹) and Indian instruments (SIP, index funds, PPF, EPF/VPF, NPS, SGB, FD, ELSS).
Structure:
## Snapshot  (2-3 sentences with the key numbers)
## How much to invest this month  (a single ₹ figure, then a short split across instruments with ₹ amounts)
## Spending: what to fix  (3-5 bullets naming actual categories/merchants and ₹ amounts to cut)
## Credit cards  (only if relevant)
## Next 30 days  (3 short action items)
Rules: be honest but encouraging; never invent numbers not derivable from the data; mention an emergency fund of ~6 months of expenses
if it is not clear one exists; keep it under 350 words; end with one line noting this is general guidance, not regulated financial advice.`;

router.post('/ai/analyse', ah(async (req, res) => {
  // Admins analysing "everyone" would mix people's finances; analyse a single person.
  const uid = scopeUserId(req) ?? req.user.id;
  const summary = await buildSummary(uid, monthParam(req));
  const advice = ruleBasedAdvice(summary);
  const provider = activeProvider();
  if (!provider) {
    return res.json({ provider: null, content: null, advice, summary });
  }
  const compact = {
    month: summary.month,
    income: summary.income,
    avgMonthlyIncome3m: Math.round(summary.avgIncome),
    expenses: summary.expenses,
    avgMonthlyExpenses3m: Math.round(summary.avgExpenses),
    investedThisMonth: summary.invested,
    needs: summary.needs,
    wants: summary.wants,
    monthlyBudget: summary.budget,
    byCategory: summary.byCategory,
    byPaymentMode: summary.byMode,
    topMerchants: summary.topMerchants,
    activeSips: summary.sips,
    investmentsByType: summary.investByType,
    stockPortfolio: summary.portfolio,
    creditCards: summary.cards,
    bankAccounts: summary.bank,
    trend6m: summary.trend,
    ruleBasedBaseline: { suggestedInvest: advice.suggestedInvest, emergencyTarget: advice.emergencyTarget, budgetSplit: advice.budgetSplit },
    userQuestion: req.body?.question ? String(req.body.question).slice(0, 500) : undefined,
  };
  try {
    const out = await complete(
      SYSTEM_PROMPT,
      `Here is my data:\n\`\`\`json\n${JSON.stringify(compact)}\n\`\`\`` +
        (compact.userQuestion ? `\n\nAlso answer my question: ${compact.userQuestion}` : '')
    );
    await db.run('INSERT INTO ai_reports (user_id, provider, month, content) VALUES (?, ?, ?, ?)', uid, out.provider, summary.month, out.text);
    res.json({ provider: out.provider, content: out.text, advice, summary });
  } catch (e) {
    console.error('[ai]', e.message);
    res.json({ provider, content: null, error: e.message, advice, summary });
  }
}));

export default router;
