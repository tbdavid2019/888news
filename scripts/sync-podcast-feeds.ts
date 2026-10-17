// Direct CLI to trigger full podcast sync (BigGo + Official RSS + YouTube Atom RSS fallback).
// Usage: node --env-file=.env scripts/sync-podcast-feeds.ts [--skip-biggo] [--limit=N]
import { closeDb } from "@aihot/backend/db";
import { syncPodcastFeeds } from "@aihot/backend/sources/podcast-sync";

const args = process.argv.slice(2);
const skipBigGo = args.includes("--skip-biggo");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limitChannels = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : undefined;

console.log(`Starting podcast feeds sync (skipBigGo: ${skipBigGo}, limit: ${limitChannels ?? "all"})...`);

try {
  const result = await syncPodcastFeeds({ skipBigGo, limitChannels });
  console.log("Podcast sync completed successfully:", result);
} catch (err) {
  console.error("Podcast sync failed:", err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
