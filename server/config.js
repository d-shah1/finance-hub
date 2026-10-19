import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'finance.db'),
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
  seedUsers: [
    { username: 'darsh', name: 'Darsh', password: process.env.DARSH_PASSWORD || 'darsh123', role: 'user' },
    { username: 'bhakti', name: 'Bhakti', password: process.env.BHAKTI_PASSWORD || 'bhakti123', role: 'user' },
    { username: 'admin', name: 'Admin', password: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin' },
  ],
};

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[config] JWT_SECRET is not set; sessions will reset on every restart.');
}
