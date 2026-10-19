import express from 'express';
import { db } from '../db.js';
import { sendToUser, vapidKeys } from '../lib/push.js';

const router = express.Router();

router.get('/public-key', (req, res) => res.json({ publicKey: vapidKeys().publicKey }));

router.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: 'Invalid subscription' });
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, subscription) VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription = excluded.subscription`
  ).run(req.user.id, sub.endpoint, JSON.stringify(sub));
  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(req.body?.endpoint || '', req.user.id);
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  const sent = await sendToUser(req.user.id, {
    title: 'Finance Hub',
    body: 'Notifications are working. You will be reminded to log your transactions every evening.',
    url: '/',
  });
  res.json({ sent });
});

export default router;
