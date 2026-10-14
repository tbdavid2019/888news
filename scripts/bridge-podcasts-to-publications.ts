// CLI script to bridge all existing podcast channels and episodes into sources, articles, and publications.
import { closeDb } from "@aihot/backend/db";
import { bridgePodcastsToPublications } from "@aihot/backend/publication/podcast-bridge";

async function main() {
  console.log("Bridging podcasts into sources, articles, and publications...");
  const result = await bridgePodcastsToPublications();
  console.log(`Success! Bridged:`, result);
  await closeDb();
}

main().catch((err) => {
  console.error("Fatal error bridging podcasts:", err);
  process.exit(1);
});
