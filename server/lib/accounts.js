import { db } from '../db.js';
import { ValidationError } from './crud.js';
import { today } from './dates.js';
import { payoutOnEnd } from './fd.js';

/** UTC timestamp in SQLite's datetime('now') format, so it compares with created_at columns. */
export const sqlNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/**
 * Throws unless `accountId` is empty or one of `ownerId`'s bank accounts.
 * Used by every form that can pick an account, so nobody can move money through someone else's.
 */
export async function checkBankAccount(accountId, ownerId) {
  if (accountId === null || accountId === undefined) return;
  const acc = await db.get('SELECT user_id FROM bank_accounts WHERE id = ?', accountId);
  if (!acc || acc.user_id !== ownerId) throw new ValidationError('That bank account does not belong to this person');
}

const TABLES = ['expenses', 'investments', 'income'];
const ANCHORED = [...TABLES, 'fixed_deposits'];

/** Records the balance moment: the last row id of each transaction table and today's date. */
export async function stampBalance(row) {
  const anchor = {};
  for (const t of ANCHORED) anchor[t] = (await db.get(`SELECT COALESCE(MAX(id), 0) AS m FROM ${t}`)).m;
  row.balance_anchor = JSON.stringify(anchor);
  row.balance_set_at = sqlNow();
  row.balance_set_date = today();
}

/**
 * Bank accounts with their current balance: the entered balance plus linked rows recorded after it
 * (higher id than the anchor) and dated that day or later. A back-dated entry logged afterwards is
 * assumed to be in the balance already entered.
 */
export async function accountsOverview(uid) {
  const accounts = await db.all(
    `SELECT a.*, u.name AS user_name FROM bank_accounts a JOIN users u ON u.id = a.user_id
     ${uid !== null ? 'WHERE a.user_id = ?' : ''} ORDER BY a.active DESC, a.name`,
    ...(uid !== null ? [uid] : [])
  );
  return Promise.all(
    accounts.map(async (a) => {
      const anchor = a.balance_anchor ? JSON.parse(a.balance_anchor) : {};
      const date = a.balance_set_date || a.balance_set_at.slice(0, 10);
      const [spent, invested, received] = await Promise.all(
        TABLES.map((t) =>
          db.get(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM ${t} WHERE bank_account_id = ? AND id > ? AND date >= ?`, a.id, anchor[t] ?? 0, date)
        )
      );
      // FDs: opening one takes the money out (renewals don't, they re-use the matured amount);
      // the payout comes back on the day it is withdrawn or matures.
      const fds = await db.all('SELECT * FROM fixed_deposits WHERE bank_account_id = ?', a.id);
      const now = today();
      let fdOut = 0;
      let fdIn = 0;
      let fdCount = 0;
      for (const f of fds) {
        if (!f.renewed_from && f.id > (anchor.fixed_deposits ?? 0) && f.start_date >= date) {
          fdOut += f.principal;
          fdCount++;
        }
        const ended = f.closed_on || (f.maturity_date <= now ? f.maturity_date : null);
        if (ended && ended > date && ended <= now) {
          const back = payoutOnEnd(f);
          if (back) {
            fdIn += back;
            fdCount++;
          }
        }
      }
      return {
        ...a,
        current_balance: a.balance - spent.total - invested.total - fdOut + received.total + fdIn,
        since: {
          spent: spent.total,
          invested: invested.total + fdOut,
          received: received.total + fdIn,
          count: spent.n + invested.n + received.n + fdCount,
        },
      };
    })
  );
}
