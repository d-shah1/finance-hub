import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';

const COOKIE = 'fh_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Lets Express 4 route handlers be async: rejected promises go to the error handler. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    reminder_time: u.reminder_time,
    reminders_enabled: !!u.reminders_enabled,
    monthly_budget: u.monthly_budget,
  };
}

export function issueSession(res, user) {
  const token = jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || config.onVercel,
    maxAge: MAX_AGE_MS,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

export const requireAuth = ah(async (req, res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  let uid;
  try {
    ({ uid } = jwt.verify(token, config.jwtSecret));
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', uid);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  req.user = user;
  next();
});

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

/**
 * Which user's data a read should cover.
 * Regular users always get their own id. Admins get the `userId` query param,
 * or null (meaning everyone) when it is absent or "all".
 */
export function scopeUserId(req) {
  if (req.user.role !== 'admin') return req.user.id;
  const q = req.query.userId;
  if (!q || q === 'all') return null;
  return Number(q);
}

/** Which user a newly created record belongs to. Admins may create on behalf of someone. */
export function ownerIdForWrite(req) {
  if (req.user.role === 'admin' && req.body?.user_id) return Number(req.body.user_id);
  return req.user.id;
}

export function canTouch(req, row) {
  return row && (req.user.role === 'admin' || row.user_id === req.user.id);
}

/** SQL fragment + args restricting a table alias to the scoped user (or nothing for "everyone"). */
export function userFilter(uid, column = 'user_id') {
  return uid === null ? { sql: '1 = 1', args: [] } : { sql: `${column} = ?`, args: [uid] };
}
