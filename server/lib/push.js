import webpush from 'web-push';
import { db, getSetting, setSetting } from '../db.js';
import { config } from '../config.js';

let vapid;

/** VAPID keys come from env, or are generated once and stored in the database. */
export function vapidKeys() {
  if (vapid) return vapid;
  let publicKey = process.env.VAPID_PUBLIC_KEY || getSetting('vapid_public');
  let privateKey = process.env.VAPID_PRIVATE_KEY || getSetting('vapid_private');
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    setSetting('vapid_public', publicKey);
    setSetting('vapid_private', privateKey);
  }
  webpush.setVapidDetails(config.vapidSubject, publicKey, privateKey);
  vapid = { publicKey, privateKey };
  return vapid;
}

export async function sendToUser(userId, payload) {
  vapidKeys();
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      // 404/410 mean the browser dropped the subscription.
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      } else {
        console.error('[push]', e.statusCode || '', e.message);
      }
    }
  }
  return sent;
}
