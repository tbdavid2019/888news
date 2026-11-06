// Rewrites the official API prices (lb_prices kind='official') from local seed files and syncs
// remaining models against models.dev + OpenRouter public catalogs.
//   node --env-file=.env scripts/import-leaderboard-prices.ts [prices.json] [--offline]
import { closeDb } from "@aihot/backend/db";
import { syncOpenRouterRankings } from "@aihot/backend/leaderboard/openrouter-rankings";
import { importOfficialPrices, syncLeaderboardCatalog } from "@aihot/backend/leaderboard/prices";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const file = args.find((a) => !a.startsWith("--"));

const { written, unknown } = await importOfficialPrices({ file, overwrite: true });
console.log(`seeded official prices ${written}`);
if (unknown.length) console.warn(`not on the leaderboard yet: ${unknown.join(", ")}`);

if (!offline && !file) {
  const synced = await syncLeaderboardCatalog();
  console.log(`catalog synced: ${synced.pricesWritten} prices, ${synced.modelsUpdated} models (${synced.contextFilled} context windows)`);
}

const market = await syncOpenRouterRankings({ forceSeed: offline }).catch((err: Error) => ({ error: err.message }));
console.log("openrouter rankings synced:", market);

await closeDb();
