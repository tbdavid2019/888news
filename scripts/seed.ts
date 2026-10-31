// Seeds a fresh site from the industry pack: the topics (industry/topics.json, updated in place), the
// demo sources (industry/sources.json, only the ones not there yet, so admin edits are never undone) and,
// with the leaderboard on, its model directory (only models and names not there yet).
// Re-runnable:  node --env-file=.env scripts/seed.ts   (--topics-only: just the topics, as the tests use)
import { readFileSync } from "node:fs";
import path from "node:path";
import { FEATURES } from "@aihot/industry/features";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { importModelDirectory } from "@aihot/backend/leaderboard/directory";
import { seedTopics } from "@aihot/backend/publication/topics";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";

interface SeedSource {
  id: string;
  name: string;
  kind: "rss" | "web_list" | "json_list" | "x_search" | "mp_account" | "external";
  config: Record<string, unknown>;
  tier?: string;
  first_party?: boolean;
  owner_entity_id?: string | null;
  participation_mode?: string;
  interval_minutes?: number;
  tags?: string[];
  site_fulltext?: boolean;
  syndicate_fulltext?: boolean;
  enabled?: boolean;
}

console.log(`topics: ${await seedTopics()}`);
if (process.argv.includes("--topics-only")) {
  await closeDb();
  process.exit(0);
}

const { sources } = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as { sources: SeedSource[] };
let added = 0;
for (const s of sources) {
  assertSupportedConfig(s.kind, s.config);
  const inserted = await sql`
    INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
    VALUES (${s.id}, ${s.name}, ${s.kind}, ${sql.json(s.config as never)}, ${s.tier ?? "T2"}, ${s.first_party ?? false}, ${s.owner_entity_id ?? null},
            ${s.participation_mode ?? "editorial"}, ${s.interval_minutes ?? 60}, ${s.tags ?? []}, ${s.site_fulltext ?? false}, ${s.syndicate_fulltext ?? false},
            ${s.enabled ?? true}, now())
    ON CONFLICT (id) DO UPDATE SET
      tier = EXCLUDED.tier,
      first_party = EXCLUDED.first_party,
      tags = EXCLUDED.tags
    RETURNING (xmax = 0) AS inserted`;
  if (inserted[0]?.inserted) added++;
}
// Disable legacy spam CVE feeds if present in database
await sql`UPDATE sources SET enabled = false WHERE id IN ('cve', 'cve-news', 'rss-cve-high', 'rss-cve-news')`;
console.log(`sources: ${added} added, ${sources.length - added} already there`);
if (FEATURES.leaderboard) {
  const { models, aliases } = await importModelDirectory();
  console.log(`leaderboard directory: ${models} models, ${aliases} names added`);
}
const { seedPodcastCatalog } = await import("./seed-podcasts.ts");
const podcastStats = await seedPodcastCatalog();
console.log(`podcasts: ${podcastStats.added} added, ${podcastStats.updated} updated (total: ${podcastStats.total})`);
await closeDb();
