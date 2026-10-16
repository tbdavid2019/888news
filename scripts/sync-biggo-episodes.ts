// Ingests real episodes from BigGo finance API into podcast_episodes table.
// Re-runnable: node --env-file=.env scripts/sync-biggo-episodes.ts [--fixture]
import { closeDb } from "@aihot/backend/db";
import { syncBigGoPodcastEpisodes } from "@aihot/backend/sources/podcast-sync";

async function main() {
  const useFixture = process.argv.includes("--fixture");
  const targetId = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1];
  const detailLimitArg = process.argv.find((a) => a.startsWith("--detail-limit="))?.split("=")[1];
  const detailLimit = detailLimitArg ? parseInt(detailLimitArg, 10) : 20;

  console.log(`Starting BigGo podcast episodes sync (${useFixture ? "fixture" : "live API"})...`);
  const result = await syncBigGoPodcastEpisodes({
    useFixtureOnly: useFixture,
    limit: 100,
    fetchDetailLimit: detailLimit,
    targetEpisodeId: targetId,
  });
  console.log(`Successfully synced BigGo podcast episodes:`, result);
  await closeDb();
}

main().catch((err) => {
  console.error("Error in sync-biggo-episodes:", err);
  process.exit(1);
});

