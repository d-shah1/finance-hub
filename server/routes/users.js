import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { clearSession, issueSession, publicUser, requireAdmin, requireAuth } from '../lib/auth.js';
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

router.post('/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const key = `${username.toLowerCase()}|${req.ip}`;
  if (tooMany(key)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFail(key);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  attempts.delete(key);
  issueSession(res, user);
  res.json(publicUser(user));
});

router.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.use(requireAuth);

router.get('/me', (req, res) => res.json(publicUser(req.user)));

router.put('/me', (req, res) => {
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
    db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => row[c]), req.user.id);
  }
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.post('/me/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
});

/** Lightweight list of people, used by the admin's "viewing" switcher. */
router.get('/users', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY role DESC, name').all();
  const stats = db.prepare(
    `SELECT (SELECT COUNT(*) FROM expenses WHERE user_id = ?) AS expenses,
            (SELECT MAX(date) FROM expenses WHERE user_id = ?) AS last_expense`
  );
  res.json(rows.map((u) => ({ ...publicUser(u), created_at: u.created_at, ...stats.get(u.id, u.id) })));
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, name, password, role } = req.body || {};
  if (!username || !name || !password) return res.status(400).json({ error: 'Username, name and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[a-z0-9_.-]{2,30}$/i.test(username)) return res.status(400).json({ error: 'Username may only contain letters, numbers, . _ -' });
  try {
    const info = db
      .prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(username, name, bcrypt.hashSync(String(password), 10), role === 'admin' ? 'admin' : 'user');
    res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
  } catch {
    res.status(409).json({ error: 'That username is taken' });
  }
});

router.post('/users/:id/password', requireAdmin, (req, res) => {
  const pw = String(req.body?.password || '');
  if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 10), req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
