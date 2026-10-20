import { db } from '../db.js';

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
 * Holdings that fail keep their previous price.
 */
export async function refreshPrices(holdings) {
  return Promise.all(
    holdings.map(async (h) => {
      try {
        const price = await fetchPrice(yahooSymbol(h));
        await db.run("UPDATE holdings SET current_price = ?, price_updated_at = datetime('now') WHERE id = ?", price, h.id);
        return { id: h.id, symbol: h.symbol, price, ok: true };
      } catch (e) {
        return { id: h.id, symbol: h.symbol, ok: false, error: e.message };
      }
    })
  );
}
