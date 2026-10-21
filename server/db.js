import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

// Local runs use a SQLite file; on Vercel DATABASE_URL points at a Turso (hosted libSQL) database.
if (config.dbUrl.startsWith('file:')) {
  fs.mkdirSync(path.dirname(config.dbUrl.slice(5)), { recursive: true });
}

// The web (HTTP) client has no native module, which keeps the Vercel function small and portable.
const local = config.dbUrl === ':memory:' || config.dbUrl.startsWith('file:');
const { createClient } = local ? await import('@libsql/client') : await import('@libsql/client/web');

export const client = createClient({ url: config.dbUrl, authToken: config.dbToken || undefined });

const toRow = (r) => (r ? { ...r } : undefined);

/** Small async query helpers shared by every module. */
export const db = {
  async all(sql, ...args) {
    const rs = await client.execute({ sql, args });
    return rs.rows.map(toRow);
  },
  async get(sql, ...args) {
    const rs = await client.execute({ sql, args });
    return toRow(rs.rows[0]);
  },
  async run(sql, ...args) {
    const rs = await client.execute({ sql, args });
    return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid) };
  },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  reminder_time TEXT NOT NULL DEFAULT '21:30',
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  card_reminder_days INTEGER NOT NULL DEFAULT 3,
  monthly_budget REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank TEXT,
  last4 TEXT,
  credit_limit REAL,
  statement_day INTEGER NOT NULL DEFAULT 1,
  due_day INTEGER NOT NULL DEFAULT 20,
  color TEXT DEFAULT '#2a78d6',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS card_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_on TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Card', 'Cash', 'UPI')),
  card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  upi_app TEXT,
  merchant TEXT,
  description TEXT,
  tags TEXT,
  is_need INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  source TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Salary',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_income_user_date ON income(user_id, date);

CREATE TABLE IF NOT EXISTS sips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Mutual Fund',
  amount REAL NOT NULL,
  day_of_month INTEGER NOT NULL DEFAULT 5,
  platform TEXT,
  start_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sip_id INTEGER REFERENCES sips(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Mutual Fund',
  amount REAL NOT NULL,
  platform TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_investments_user_date ON investments(user_id, date);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  exchange TEXT NOT NULL DEFAULT 'NSE',
  quantity REAL NOT NULL,
  avg_price REAL NOT NULL,
  current_price REAL,
  buy_date TEXT,
  sector TEXT,
  notes TEXT,
  price_updated_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  isin TEXT,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank TEXT,
  account_type TEXT NOT NULL DEFAULT 'Savings',
  last4 TEXT,
  -- Balance the person entered, and when. The current balance is this plus the linked
  -- transactions recorded after it (see lib/accounts.js). balance_anchor holds the last row id
  -- of each transaction table at that moment, so "after" is exact rather than clock-based.
  balance REAL NOT NULL DEFAULT 0,
  balance_set_at TEXT NOT NULL DEFAULT (datetime('now')),
  balance_set_date TEXT,
  balance_anchor TEXT,
  color TEXT DEFAULT '#1baf7a',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  month TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sent_notifications (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let ready;
/**
 * Creates tables and starter accounts once per process (each serverless cold start).
 * Resolves to the accounts created on this call, which is empty unless the database was new.
 */
export function init() {
  ready ??= (async () => {
    await client.executeMultiple(SCHEMA);
    await migrate();
    return seedUsers();
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

// Columns added after the first release; CREATE TABLE IF NOT EXISTS does not add them to older databases.
const ADDED_COLUMNS = {
  holdings: ["source TEXT NOT NULL DEFAULT 'manual'", 'isin TEXT', 'synced_at TEXT'],
  // Which bank account money left (or, for income, arrived in).
  expenses: ['bank_account_id INTEGER'],
  investments: ['bank_account_id INTEGER'],
  sips: ['bank_account_id INTEGER'],
  income: ['bank_account_id INTEGER'],
};

async function migrate() {
  for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set((await db.all(`PRAGMA table_info(${table})`)).map((c) => c.name));
    for (const def of cols) {
      if (!have.has(def.split(' ')[0])) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    }
  }
}

export async function getSetting(key) {
  return (await db.get('SELECT value FROM app_settings WHERE key = ?', key))?.value;
}

export async function setSetting(key, value) {
  await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/** Creates the initial accounts (Darsh, Bhakti, admin) on first run. */
export async function seedUsers() {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (n > 0) return [];
  const created = [];
  for (const u of config.seedUsers) {
    await db.run('INSERT OR IGNORE INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)', u.username, u.name, bcrypt.hashSync(u.password, 10), u.role);
    created.push(u);
  }
  return created;
}
