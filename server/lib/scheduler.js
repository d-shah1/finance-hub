import cron from 'node-cron';
import { db } from '../db.js';
import { sendToUser } from './push.js';
import { nowParts } from './dates.js';
import { cardsOverview } from '../routes/cards.js';

const MORNING = '09:00';

function once(key, fn) {
  const done = db.prepare('SELECT 1 FROM sent_notifications WHERE key = ?').get(key);
  if (done) return;
  db.prepare('INSERT INTO sent_notifications (key) VALUES (?)').run(key);
  return fn();
}

const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Runs every minute. Each reminder fires at most once per day, at or after its time. */
export async function tick(date = new Date()) {
  const now = nowParts(date);
  const users = db.prepare('SELECT * FROM users WHERE reminders_enabled = 1').all();
  const jobs = [];
  for (const u of users) {
    // End-of-day nudge to log transactions.
    if (now.time >= u.reminder_time) {
      jobs.push(
        once(`daily:${u.id}:${now.date}`, () => {
          const n = db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE user_id = ? AND date = ?').get(u.id, now.date).n;
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
      for (const c of cardsOverview(u.id, now.date)) {
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
      const sips = db.prepare('SELECT * FROM sips WHERE user_id = ? AND active = 1 AND day_of_month = ?').all(u.id, now.day);
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
}

export function startScheduler() {
  cron.schedule('* * * * *', () => tick().catch((e) => console.error('[scheduler]', e)));
  // Keep the dedupe table small.
  cron.schedule('0 3 * * *', () => db.prepare("DELETE FROM sent_notifications WHERE sent_at < datetime('now', '-40 days')").run());
}
