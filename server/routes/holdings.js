import { db } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { ah, scopeUserId } from '../lib/auth.js';
import { refreshPrices } from '../lib/prices.js';
import { growwStatus, syncGroww } from '../lib/groww.js';

const router = crudRouter({
  table: 'holdings',
  orderBy: 't.symbol ASC',
  fields: {
    symbol: { type: 'string', required: true, maxLength: 30, label: 'Symbol' },
    name: { type: 'string', maxLength: 120 },
    exchange: { type: 'string', enum: ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'Other'], default: 'NSE', label: 'Exchange' },
    quantity: { type: 'number', required: true, min: 0, label: 'Quantity' },
    avg_price: { type: 'number', required: true, min: 0, label: 'Average buy price' },
    current_price: { type: 'number', min: 0 },
    buy_date: { type: 'date' },
    sector: { type: 'string', maxLength: 60 },
    notes: { type: 'string', maxLength: 1000 },
  },
});

/**
 * Best-effort refresh of current prices from Yahoo Finance's free public chart endpoint.
 * Holdings that fail keep their manually entered price.
 */
router.post('/refresh-prices', ah(async (req, res) => {
  const uid = scopeUserId(req);
  const holdings = await db.all(`SELECT * FROM holdings ${uid !== null ? 'WHERE user_id = ?' : ''}`, ...(uid !== null ? [uid] : []));
  const results = await refreshPrices(holdings);
  res.json({ updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), results });
}));

/** The person whose Groww account a request is about: yourself, or the person an admin is viewing. */
async function growwTarget(req, res) {
  const uid = scopeUserId(req);
  if (uid === null) {
    res.status(400).json({ error: 'Pick a person in the Viewing menu first.' });
    return null;
  }
  const user = uid === req.user.id ? req.user : await db.get('SELECT * FROM users WHERE id = ?', uid);
  if (!user) res.status(404).json({ error: 'Not found' });
  return user;
}

router.get('/groww', ah(async (req, res) => {
  if (scopeUserId(req) === null) return res.json({ configured: false, everyone: true });
  const user = await growwTarget(req, res);
  if (user) res.json(await growwStatus(user));
}));

router.post('/groww/sync', ah(async (req, res) => {
  const user = await growwTarget(req, res);
  if (!user) return;
  try {
    const status = await syncGroww(user);
    res.status(status.ok ? 200 : 502).json(status);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

export default router;
