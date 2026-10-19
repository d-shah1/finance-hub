import { db } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { scopeUserId } from '../lib/auth.js';

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

function yahooSymbol(h) {
  const s = h.symbol.toUpperCase().trim();
  if (s.includes('.')) return s;
  if (h.exchange === 'NSE') return `${s}.NS`;
  if (h.exchange === 'BSE') return `${s}.BO`;
  return s;
}

async function fetchPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 FinanceHub' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== 'number') throw new Error('No price in response');
  return price;
}

/**
 * Best-effort refresh of current prices from Yahoo Finance's free public chart endpoint.
 * Holdings that fail keep their manually entered price.
 */
router.post('/refresh-prices', async (req, res) => {
  const uid = scopeUserId(req);
  const holdings = db
    .prepare(`SELECT * FROM holdings ${uid !== null ? 'WHERE user_id = ?' : ''}`)
    .all(...(uid !== null ? [uid] : []));
  const update = db.prepare("UPDATE holdings SET current_price = ?, price_updated_at = datetime('now') WHERE id = ?");
  const results = await Promise.all(
    holdings.map(async (h) => {
      try {
        const price = await fetchPrice(yahooSymbol(h));
        update.run(price, h.id);
        return { id: h.id, symbol: h.symbol, price, ok: true };
      } catch (e) {
        return { id: h.id, symbol: h.symbol, ok: false, error: e.message };
      }
    })
  );
  res.json({ updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), results });
});

export default router;
