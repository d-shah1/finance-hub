import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const onVercel = !!process.env.VERCEL;

// libSQL URL: file:... locally, libsql://<db>.turso.io on Vercel. DB_PATH is still accepted for local files.
function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = process.env.DB_PATH;
  if (p === ':memory:') return ':memory:';
  return `file:${p ? path.resolve(p) : path.join(root, 'data', 'finance.db')}`;
}

// Default passwords are fine on your own computer but never on a public URL.
function seedPassword(envName, fallback) {
  const v = process.env[envName];
  if (v) return v;
  if (onVercel) {
    const err = new Error(`Setup needed: add the ${envName} environment variable in Vercel, then redeploy.`);
    err.status = 503; // shown to the user instead of a generic error
    throw err;
  }
  return fallback;
}

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  onVercel,
  dbUrl: dbUrl(),
  dbToken: process.env.DATABASE_AUTH_TOKEN || '',
  cronSecret: process.env.CRON_SECRET || '',
  // A stable secret is required in production so logins survive restarts.
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  timezone: process.env.TZ_NAME || 'Asia/Kolkata',
  publicUrl: process.env.PUBLIC_URL || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  ai: {
    provider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
    groqKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ollamaUrl: process.env.OLLAMA_URL || '',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
  },
  // Read lazily so a missing password only matters when the accounts are first created.
  get seedUsers() {
    return [
      { username: 'darsh', name: 'Darsh', password: seedPassword('DARSH_PASSWORD', 'darsh123'), role: 'user' },
      { username: 'bhakti', name: 'Bhakti', password: seedPassword('BHAKTI_PASSWORD', 'bhakti123'), role: 'user' },
      { username: 'admin', name: 'Admin', password: seedPassword('ADMIN_PASSWORD', 'admin123'), role: 'admin' },
    ];
  },
};

if (!process.env.JWT_SECRET) {
  // Serverless instances would each pick a different random secret and log people out constantly.
  if (onVercel) throw new Error('Set the JWT_SECRET environment variable in Vercel.');
  if (process.env.NODE_ENV === 'production') console.warn('[config] JWT_SECRET is not set; sessions will reset on every restart.');
}
