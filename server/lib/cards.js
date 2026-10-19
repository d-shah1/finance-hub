import { addDays, clampedDate, diffDays } from './dates.js';

/**
 * Billing cycle for a card as of `todayIso`.
 * The statement is generated on `statement_day`; the bill is due on `due_day`,
 * in the same month if due_day > statement_day, otherwise the following month.
 */
export function cardCycle(card, todayIso) {
  const [y, m, d] = todayIso.split('-').map(Number);
  const S = card.statement_day;
  const D = card.due_day;
  // Most recent statement date on or before today.
  let stmt = clampedDate(y, m, S);
  if (stmt > todayIso) stmt = clampedDate(y, m - 1, S);
  const [sy, sm] = stmt.split('-').map(Number);
  const prevStmt = clampedDate(sy, sm - 1, S);
  const nextStmt = clampedDate(sy, sm + 1, S);
  const due = D > S ? clampedDate(sy, sm, D) : clampedDate(sy, sm + 1, D);
  return {
    billed_from: addDays(prevStmt, 1),
    billed_to: stmt,
    unbilled_from: addDays(stmt, 1),
    next_statement: nextStmt,
    due_date: due,
    days_to_due: diffDays(todayIso, due),
    day: d,
  };
}
