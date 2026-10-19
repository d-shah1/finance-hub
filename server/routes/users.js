import express from 'express';
import bcrypt from 'bcryptjs';
import { client, db } from '../db.js';
import { ah, clearSession, issueSession, publicUser, requireAdmin, requireAuth } from '../lib/auth.js';
import { parseBody } from '../lib/crud.js';

const router = express.Router();

// Simple in-memory brute-force guard: 10 failed attempts per username+IP per 15 minutes.
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 15 * 60 * 1000) return false;
  return rec.count >= 10;
}
function recordFail(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 15 * 60 * 1000) attempts.set(key, { first: now, count: 1 });
  else rec.count++;
}

router.post('/auth/login', ah(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const key = `${username.toLowerCase()}|${req.ip}`;
  if (tooMany(key)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const user = await db.get('SELECT * FROM users WHERE username = ?', username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFail(key);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  attempts.delete(key);
  issueSession(res, user);
  res.json(publicUser(user));
}));

router.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.use(requireAuth);

router.get('/me', (req, res) => res.json(publicUser(req.user)));

router.put('/me', ah(async (req, res) => {
  const row = parseBody(
    req.body,
    {
      name: { type: 'string', maxLength: 60 },
      reminder_time: { type: 'string', maxLength: 5 },
      reminders_enabled: { type: 'bool' },
      card_reminder_days: { type: 'int', min: 0, max: 15 },
      monthly_budget: { type: 'number', min: 0 },
    },
    { partial: true }
  );
  if (row.reminder_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.reminder_time)) {
    return res.status(400).json({ error: 'Reminder time must be HH:MM' });
  }
  if (row.name === null) delete row.name;
  const cols = Object.keys(row);
  if (cols.length) {
    await db.run(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => row[c]), req.user.id);
  }
  res.json(publicUser(await db.get('SELECT * FROM users WHERE id = ?', req.user.id)));
}));

router.post('/me/password', ah(async (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
}));

/** Lightweight list of people, used by the admin's "viewing" switcher. */
router.get('/users', requireAdmin, ah(async (req, res) => {
  const rows = await db.all(
    `SELECT u.*, (SELECT COUNT(*) FROM expenses e WHERE e.user_id = u.id) AS expenses,
            (SELECT MAX(date) FROM expenses e WHERE e.user_id = u.id) AS last_expense
     FROM users u ORDER BY u.role DESC, u.name`
  );
  res.json(rows.map((u) => ({ ...publicUser(u), created_at: u.created_at, expenses: u.expenses, last_expense: u.last_expense })));
}));

router.post('/users', requireAdmin, ah(async (req, res) => {
  const { username, name, password, role } = req.body || {};
  if (!username || !name || !password) return res.status(400).json({ error: 'Username, name and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[a-z0-9_.-]{2,30}$/i.test(username)) return res.status(400).json({ error: 'Username may only contain letters, numbers, . _ -' });
  if (await db.get('SELECT 1 FROM users WHERE username = ?', username)) return res.status(409).json({ error: 'That username is taken' });
  const info = await db.run(
    'INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)',
    username, name, bcrypt.hashSync(String(password), 10), role === 'admin' ? 'admin' : 'user'
  );
  res.status(201).json(publicUser(await db.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid)));
}));

router.post('/users/:id/password', requireAdmin, ah(async (req, res) => {
  const pw = String(req.body?.password || '');
  if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const info = await db.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(pw, 10), req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

const USER_TABLES = ['card_payments', 'expenses', 'income', 'investments', 'sips', 'holdings', 'cards', 'push_subscriptions', 'ai_reports'];

router.delete('/users/:id', requireAdmin, ah(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  // Explicit cleanup, since hosted libSQL may not enforce ON DELETE CASCADE.
  await client.batch(
    [...USER_TABLES.map((t) => ({ sql: `DELETE FROM ${t} WHERE user_id = ?`, args: [req.params.id] })), { sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] }],
    'write'
  );
  res.json({ ok: true });
}));

export default router;
