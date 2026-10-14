// Financial stock quotes provider with in-memory & Postgres caching.
// Adheres to rule: Reader page loads never trigger external paid APIs.
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";

export interface MarketQuote {
  ticker: string;
  name: string;
  exchange: string;
  price: number;
  changeAmount: number;
  changePercent: number;
  currency: string;
  marketTime: Date;
}

export function parseYahooChartQuote(data: Record<string, unknown>, symbol: string): MarketQuote | null {
  try {
    const chart = data.chart as Record<string, unknown> | undefined;
    const result = (chart?.result as Array<Record<string, unknown>> | undefined)?.[0];
    if (!result) return null;

    const meta = result.meta as Record<string, unknown> | undefined;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice ?? 0);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    const changeAmount = Number((price - prevClose).toFixed(4));
    const changePercent = prevClose > 0 ? Number((((price - prevClose) / prevClose) * 100).toFixed(4)) : 0;
    const name = String(meta.shortName || meta.longName || symbol);
    const exchange = String(meta.exchangeName || meta.fullExchangeName || "GLOBAL");
    const currency = String(meta.currency || "USD");
    const timeSec = Number(meta.regularMarketTime ?? Math.floor(Date.now() / 1000));

    return {
      ticker: symbol,
      name,
      exchange,
      price,
      changeAmount,
      changePercent,
      currency,
      marketTime: new Date(timeSec * 1000),
    };
  } catch {
    return null;
  }
}

export async function fetchTickerQuote(ticker: string): Promise<MarketQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  try {
    const res = await guardedFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketBot/1.0)" },
      timeoutMs: 8000,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const json = JSON.parse(res.text()) as Record<string, unknown>;
    return parseYahooChartQuote(json, ticker);
  } catch {
    return null;
  }
}

export async function getCachedMarketQuotes(tickers: string[]): Promise<Record<string, MarketQuote>> {
  if (tickers.length === 0) return {};

  const rows = await sql<{
    ticker: string;
    name: string;
    exchange: string;
    price: string | number;
    change_amount: string | number;
    change_percent: string | number;
    currency: string;
    market_time: Date;
  }[]>`
    SELECT ticker, name, exchange, price, change_amount, change_percent, currency, market_time
    FROM market_quotes
    WHERE ticker = ANY(${tickers})
  `;

  const map: Record<string, MarketQuote> = {};
  for (const r of rows) {
    map[r.ticker] = {
      ticker: r.ticker,
      name: r.name,
      exchange: r.exchange,
      price: Number(r.price),
      changeAmount: Number(r.change_amount),
      changePercent: Number(r.change_percent),
      currency: r.currency,
      marketTime: r.market_time,
    };
  }
  return map;
}

export async function upsertMarketQuote(quote: MarketQuote): Promise<void> {
  await sql`
    INSERT INTO market_quotes (
      ticker, name, exchange, price, change_amount, change_percent, currency, market_time, updated_at
    ) VALUES (
      ${quote.ticker}, ${quote.name}, ${quote.exchange}, ${quote.price},
      ${quote.changeAmount}, ${quote.changePercent}, ${quote.currency}, ${quote.marketTime}, now()
    )
    ON CONFLICT (ticker) DO UPDATE SET
      name = EXCLUDED.name,
      exchange = EXCLUDED.exchange,
      price = EXCLUDED.price,
      change_amount = EXCLUDED.change_amount,
      change_percent = EXCLUDED.change_percent,
      currency = EXCLUDED.currency,
      market_time = EXCLUDED.market_time,
      updated_at = now()
  `;
}
