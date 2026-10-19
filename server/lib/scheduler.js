import cron from 'node-cron';
import { db } from '../db.js';
import { sendToUser } from './push.js';
import { nowParts } from './dates.js';
import { cardsOverview } from '../routes/cards.js';

const MORNING = '09:00';

/** Runs fn only the first time `key` is seen. INSERT OR IGNORE makes overlapping cron calls safe. */
async function once(key, fn) {
  const { changes } = await db.run('INSERT OR IGNORE INTO sent_notifications (key) VALUES (?)', key);
  if (changes) return fn();
}

const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Sends any reminders that are due. Each fires at most once per day, on the first tick at or
 * after its time, so it works whether ticks come every minute (local) or every few minutes (cron service).
 */
export async function tick(date = new Date()) {
  const now = nowParts(date);
  const users = await db.all('SELECT * FROM users WHERE reminders_enabled = 1');
  const jobs = [];
  for (const u of users) {
    // End-of-day nudge to log transactions.
    if (now.time >= u.reminder_time) {
      jobs.push(
        once(`daily:${u.id}:${now.date}`, async () => {
          const { n } = await db.get('SELECT COUNT(*) AS n FROM expenses WHERE user_id = ? AND date = ?', u.id, now.date);
          return sendToUser(u.id, {
            title: n ? `You logged ${n} transaction${n > 1 ? 's' : ''} today` : "Log today's transactions",
            body: n ? 'Anything else you paid for today? Add it before you forget.' : "You haven't added any expenses today. Take 30 seconds to log them.",
            url: '/expenses?new=1',
            tag: 'daily-log',
          });
        })
      );
    }

    if (now.time >= MORNING) {
      // Credit card bills coming due.
      for (const c of await cardsOverview(u.id, now.date)) {
        if (c.status === 'paid') continue;
        const d = c.cycle.days_to_due;
        if (d === u.card_reminder_days || d === 1 || d === 0 || d === -1) {
          jobs.push(
            once(`card:${c.id}:${c.cycle.due_date}:${d}`, () =>
              sendToUser(u.id, {
                title: d < 0 ? `${c.name} bill is overdue` : d === 0 ? `${c.name} bill is due today` : `${c.name} bill due in ${d} day${d > 1 ? 's' : ''}`,
                body: `Due ${c.cycle.due_date} · Billed ${fmt(c.billed_amount)}. Tap to mark it paid.`,
                url: '/cards',
                tag: `card-${c.id}`,
              })
            )
          );
        }
      }
      // Monthly investment instalments.
      const sips = await db.all('SELECT * FROM sips WHERE user_id = ? AND active = 1 AND day_of_month = ?', u.id, now.day);
      for (const s of sips) {
        jobs.push(
          once(`sip:${s.id}:${now.date}`, () =>
            sendToUser(u.id, { title: `SIP day: ${s.name}`, body: `${fmt(s.amount)} is scheduled today. Log it once it's done.`, url: '/investments', tag: `sip-${s.id}` })
          )
        );
      }
    }
  }
  await Promise.allSettled(jobs);
  // Keep the dedupe table small.
  await db.run("DELETE FROM sent_notifications WHERE sent_at < datetime('now', '-40 days')");
}

/** Local/long-running servers tick every minute. On Vercel, /api/cron is called instead. */
export function startScheduler() {
  cron.schedule('* * * * *', () => tick().catch((e) => console.error('[scheduler]', e)));
}
