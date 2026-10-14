// Fetches and caches real live quotes from Yahoo Finance into market_quotes table
import { closeDb, sql } from "@aihot/backend/db";
import { fetchTickerQuote, upsertMarketQuote } from "@aihot/backend/providers/market";

async function main() {
  console.log("Gathering distinct stock tickers from podcast_episode_tickers...");
  const rows = await sql<{ ticker: string }[]>`
    SELECT DISTINCT ticker FROM podcast_episode_tickers WHERE ticker IS NOT NULL AND ticker != ''
  `;

  // Always include key benchmark tech tickers
  const coreTickers = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "2330.TW", "UBER", "TSLA", "NET", "CRM", "NFLX"];
  const allTickers = Array.from(new Set([...rows.map((r) => r.ticker), ...coreTickers]));

  console.log(`Fetching live market quotes for ${allTickers.length} tickers...`);

  let successCount = 0;
  // Process in small batches to respect network limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < allTickers.length; i += BATCH_SIZE) {
    const batch = allTickers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const quote = await fetchTickerQuote(ticker);
          if (quote) {
            await upsertMarketQuote(quote);
            successCount++;
            console.log(`[OK] ${ticker}: $${quote.price} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%)`);
          } else {
            console.warn(`[WARN] Could not fetch quote for ${ticker}`);
          }
        } catch (err: any) {
          console.error(`[ERR] Failed for ${ticker}:`, err.message);
        }
      })
    );
  }

  console.log(`Done! Successfully cached ${successCount} market quotes in PostgreSQL.`);
  await closeDb();
}

main().catch((err) => {
  console.error("Fatal error syncing market quotes:", err);
  process.exit(1);
});
