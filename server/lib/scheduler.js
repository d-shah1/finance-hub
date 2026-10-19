import cron from 'node-cron';
import { db } from '../db.js';
import { sendToUser } from './push.js';
import { addDays, clampedDate, monthRange, nowParts } from './dates.js';
import { cardsOverview } from '../routes/cards.js';

const MORNING = '09:00';

/** Runs fn only the first time `key` is seen. INSERT OR IGNORE makes overlapping cron calls safe. */
async function once(key, fn) {
  const { changes } = await db.run('INSERT OR IGNORE INTO sent_notifications (key) VALUES (?)', key);
  if (changes) return fn();
}

const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const niceDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function dailyLogReminder(u, now) {
  return once(`daily:${u.id}:${now.date}`, async () => {
    const { n } = await db.get('SELECT COUNT(*) AS n FROM expenses WHERE user_id = ? AND date = ?', u.id, now.date);
    return sendToUser(u.id, {
      title: n ? `You logged ${n} transaction${n > 1 ? 's' : ''} today` : "Log today's transactions",
      body: n ? 'Anything else you paid for today? Add it before you forget.' : "You haven't added any expenses today. Take 30 seconds to log them.",
      url: '/expenses?new=1',
      tag: 'daily-log',
    });
  });
}

/** Heads-up the day before each unpaid card bill and each SIP not yet logged this month. */
async function dayBeforeReminders(u, now) {
  const jobs = [];
  const tomorrow = addDays(now.date, 1);
  for (const c of await cardsOverview(u.id, now.date)) {
    if (c.status === 'paid' || c.cycle.due_date !== tomorrow) continue;
    jobs.push(
      once(`card:${c.id}:${c.cycle.due_date}`, () =>
        sendToUser(u.id, {
          title: `${c.name} bill is due tomorrow`,
          body: `Billed ${fmt(c.billed_amount)}, due ${niceDate(c.cycle.due_date)}. Tap to mark it paid.`,
          url: '/cards',
          tag: `card-${c.id}`,
        })
      )
    );
  }
  const [ty, tm] = tomorrow.split('-').map(Number);
  const { from, to } = monthRange(tomorrow.slice(0, 7));
  for (const s of await db.all('SELECT * FROM sips WHERE user_id = ? AND active = 1', u.id)) {
    // A plan on the 31st falls on the last day of shorter months.
    if (clampedDate(ty, tm, s.day_of_month) !== tomorrow) continue;
    const logged = await db.get('SELECT 1 FROM investments WHERE sip_id = ? AND date BETWEEN ? AND ?', s.id, from, to);
    if (logged) continue;
    jobs.push(
      once(`sip:${s.id}:${tomorrow}`, () =>
        sendToUser(u.id, {
          title: `SIP tomorrow: ${s.name}`,
          body: `${fmt(s.amount)} will be debited ${niceDate(tomorrow)}. Keep the balance ready.`,
          url: '/investments',
          tag: `sip-${s.id}`,
        })
      )
    );
  }
  return Promise.allSettled(jobs);
}

/**
 * Sends the reminders that are due. Each one is sent at most once (see `once`), so overlapping
 * or repeated runs are harmless.
 *
 * - job 'evening': the "log today's transactions" reminder to everyone, now. Vercel runs this once
 *   each evening.
 * - job 'morning': card bill and SIP reminders for anything due tomorrow, now. Vercel runs this once
 *   each morning.
 * - no job (the built-in every-minute scheduler on a long-running server): each person's evening
 *   reminder at their chosen time, and the day-before reminders from 9 AM.
 */
export async function tick(date = new Date(), { job } = {}) {
  const now = nowParts(date);
  const users = await db.all('SELECT * FROM users WHERE reminders_enabled = 1');
  const jobs = [];
  for (const u of users) {
    if (job === 'evening' || (!job && now.time >= u.reminder_time)) jobs.push(dailyLogReminder(u, now));
    if (job === 'morning' || (!job && now.time >= MORNING)) jobs.push(dayBeforeReminders(u, now));
  }
  await Promise.allSettled(jobs);
  // Keep the dedupe table small.
  await db.run("DELETE FROM sent_notifications WHERE sent_at < datetime('now', '-40 days')");
}

/** Local/long-running servers tick every minute. On Vercel, /api/cron is called instead. */
export function startScheduler() {
  cron.schedule('* * * * *', () => tick().catch((e) => console.error('[scheduler]', e)));
}
