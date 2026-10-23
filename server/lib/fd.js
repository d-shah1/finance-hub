// Fixed deposit maths. Indian banks compound quarterly for most FDs and pay simple interest on very
// short ones; this mirrors that closely. It ignores the broken-period detail of each bank, so a
// figure can differ from the bank's certificate by a few rupees. TDS is not deducted.
import { addDays, clampedDate, diffDays, today } from './dates.js';

export const COMPOUNDING = { monthly: 12, quarterly: 4, 'half-yearly': 2, yearly: 1, simple: 0 };
export const PAYOUTS = ['cumulative', 'monthly', 'quarterly'];

/** Maturity date from a start date and a tenure of months plus days. */
export function maturityDate(start, months = 0, days = 0) {
  const [y, m, d] = start.split('-').map(Number);
  const afterMonths = months ? clampedDate(y, m + Number(months), d) : start;
  return addDays(afterMonths, Number(days) || 0);
}

const years = (from, to) => Math.max(0, diffDays(from, to)) / 365;

/** Value of a cumulative FD (principal + interest so far) on `date`, capped at maturity. */
function cumulativeValue(fd, date) {
  const end = date < fd.maturity_date ? date : fd.maturity_date;
  const t = years(fd.start_date, end);
  const r = fd.rate / 100;
  const n = COMPOUNDING[fd.compounding] ?? 4;
  // Short deposits (under ~6 months) earn simple interest at most banks.
  if (!n || diffDays(fd.start_date, fd.maturity_date) < 181) return fd.principal * (1 + r * t);
  return fd.principal * (1 + r / n) ** (n * t);
}

/** Interest an interest-payout FD has paid out by `date` (simple, at the FD rate). */
function paidOutInterest(fd, date) {
  const end = date < fd.maturity_date ? date : fd.maturity_date;
  return fd.principal * (fd.rate / 100) * years(fd.start_date, end);
}

export function maturityAmount(fd) {
  return fd.payout === 'cumulative' ? cumulativeValue(fd, fd.maturity_date) : fd.principal;
}

/**
 * Status and figures for one FD on `todayIso`:
 * active (running), matured (reached maturity, money assumed paid out unless renewed),
 * closed (withdrawn early or renewed).
 */
export function fdFigures(fd, todayIso = today()) {
  const status = fd.closed_on ? 'closed' : fd.maturity_date <= todayIso ? 'matured' : 'active';
  const cumulative = fd.payout === 'cumulative';
  const asOf = fd.closed_on || todayIso;
  const value = cumulative ? cumulativeValue(fd, asOf) : fd.principal;
  const interestSoFar = cumulative ? value - fd.principal : paidOutInterest(fd, asOf);
  const totalDays = Math.max(1, diffDays(fd.start_date, fd.maturity_date));
  const elapsed = Math.min(totalDays, Math.max(0, diffDays(fd.start_date, todayIso)));
  const maturity = maturityAmount(fd);
  return {
    status,
    value_today: status === 'active' ? value : status === 'closed' ? fd.close_amount ?? value : maturity,
    interest_so_far: interestSoFar,
    maturity_amount: maturity,
    total_interest: cumulative ? maturity - fd.principal : paidOutInterest(fd, fd.maturity_date),
    days_left: Math.max(0, diffDays(todayIso, fd.maturity_date)),
    term_days: totalDays, // not "tenure_days": that is a stored column and must not be overwritten
    progress: elapsed / totalDays,
  };
}

/** What lands in the bank account when an FD ends: the closing amount, or the maturity payout. */
export function payoutOnEnd(fd) {
  if (fd.closed_on) return fd.close_type === 'renewed' ? 0 : fd.close_amount ?? 0;
  return maturityAmount(fd);
}
