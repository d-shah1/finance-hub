import express from 'express';
import { db } from '../db.js';
import { ah } from '../lib/auth.js';
import { sendToUser, vapidKeys } from '../lib/push.js';

const router = express.Router();

router.get('/public-key', ah(async (req, res) => res.json({ publicKey: (await vapidKeys()).publicKey })));

router.post('/subscribe', ah(async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: 'Invalid subscription' });
  await db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, subscription) VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription = excluded.subscription`,
    req.user.id, sub.endpoint, JSON.stringify(sub)
  );
  res.json({ ok: true });
}));

router.post('/unsubscribe', ah(async (req, res) => {
  await db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', req.body?.endpoint || '', req.user.id);
  res.json({ ok: true });
}));

router.post('/test', ah(async (req, res) => {
  const sent = await sendToUser(req.user.id, {
    title: 'Finance Hub',
    body: 'Notifications are working. You will be reminded to log your transactions every evening.',
    url: '/',
  });
  res.json({ sent });
}));

export default router;
