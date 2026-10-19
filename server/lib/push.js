import webpush from 'web-push';
import { db, getSetting } from '../db.js';
import { config } from '../config.js';

let vapid;

/** VAPID keys come from env, or are generated once and stored in the database. */
export async function vapidKeys() {
  if (vapid) return vapid;
  let publicKey = process.env.VAPID_PUBLIC_KEY || (await getSetting('vapid_public'));
  let privateKey = process.env.VAPID_PRIVATE_KEY || (await getSetting('vapid_private'));
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    // INSERT OR IGNORE then re-read, so two cold starts racing agree on one key pair.
    await db.run("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vapid_public', ?)", publicKey);
    await db.run("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vapid_private', ?)", privateKey);
    publicKey = await getSetting('vapid_public');
    privateKey = await getSetting('vapid_private');
  }
  webpush.setVapidDetails(config.vapidSubject, publicKey, privateKey);
  vapid = { publicKey, privateKey };
  return vapid;
}

export async function sendToUser(userId, payload) {
  await vapidKeys();
  const subs = await db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      // 404/410 mean the browser dropped the subscription.
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.run('DELETE FROM push_subscriptions WHERE id = ?', s.id);
      } else {
        console.error('[push]', e.statusCode || '', e.message);
      }
    }
  }
  return sent;
}
