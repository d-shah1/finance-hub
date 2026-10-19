import express from 'express';
import { db } from '../db.js';
import { canTouch, ownerIdForWrite, scopeUserId } from './auth.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerces and validates a request body against a field spec. `partial` skips required checks. */
export function parseBody(body, fields, { partial = false } = {}) {
  const out = {};
  for (const [name, spec] of Object.entries(fields)) {
    let v = body?.[name];
    const missing = v === undefined || v === null || v === '';
    if (missing) {
      if (partial && v === undefined) continue;
      if (spec.required) throw new ValidationError(`${spec.label || name} is required`);
      out[name] = spec.default !== undefined ? spec.default : null;
      continue;
    }
    switch (spec.type) {
      case 'number':
      case 'int': {
        v = Number(v);
        if (!Number.isFinite(v)) throw new ValidationError(`${spec.label || name} must be a number`);
        if (spec.type === 'int') v = Math.trunc(v);
        if (spec.min !== undefined && v < spec.min) throw new ValidationError(`${spec.label || name} must be at least ${spec.min}`);
        if (spec.max !== undefined && v > spec.max) throw new ValidationError(`${spec.label || name} must be at most ${spec.max}`);
        break;
      }
      case 'bool':
        v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
        break;
      case 'date':
        if (!DATE_RE.test(String(v))) throw new ValidationError(`${spec.label || name} must be a YYYY-MM-DD date`);
        v = String(v);
        break;
      default:
        v = String(v).trim().slice(0, spec.maxLength || 500);
    }
    if (spec.enum && !spec.enum.includes(v)) {
      throw new ValidationError(`${spec.label || name} must be one of: ${spec.enum.join(', ')}`);
    }
    out[name] = v;
  }
  return out;
}

/**
 * Builds list/create/update/delete routes for a user-owned table.
 *
 * options.filters(req) returns extra { clauses: [], params: [] } for listing.
 * options.beforeSave(row, req, existing) may validate or adjust a row before it is written.
 */
export function crudRouter({ table, fields, orderBy = 'id DESC', dateColumn, filters, beforeSave }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const clauses = [];
    const params = [];
    const uid = scopeUserId(req);
    if (uid !== null) {
      clauses.push('t.user_id = ?');
      params.push(uid);
    }
    if (dateColumn && req.query.from) {
      clauses.push(`t.${dateColumn} >= ?`);
      params.push(req.query.from);
    }
    if (dateColumn && req.query.to) {
      clauses.push(`t.${dateColumn} <= ?`);
      params.push(req.query.to);
    }
    if (filters) {
      const extra = filters(req);
      clauses.push(...extra.clauses);
      params.push(...extra.params);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Number(req.query.limit) || 1000, 5000);
    const rows = db
      .prepare(
        `SELECT t.*, u.name AS user_name FROM ${table} t JOIN users u ON u.id = t.user_id ${where} ORDER BY ${orderBy} LIMIT ${limit}`
      )
      .all(...params);
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const row = parseBody(req.body, fields);
    row.user_id = ownerIdForWrite(req);
    beforeSave?.(row, req, null);
    const cols = Object.keys(row);
    const info = db
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => row[c]));
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!canTouch(req, existing)) return res.status(404).json({ error: 'Not found' });
    const row = parseBody(req.body, fields, { partial: true });
    beforeSave?.(row, req, existing);
    const cols = Object.keys(row);
    if (cols.length) {
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
        ...cols.map((c) => row[c]),
        existing.id
      );
    }
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(existing.id));
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!canTouch(req, existing)) return res.status(404).json({ error: 'Not found' });
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id);
    res.json({ ok: true });
  });

  return router;
}
