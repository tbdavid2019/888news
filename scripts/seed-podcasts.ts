// Seeds podcast channels from industry/podcasts.json into the podcasts table.
// Re-runnable: node --env-file=.env scripts/seed-podcasts.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";

interface SeedPodcastChannel {
  id: string;
  name: string;
  description?: string;
  cover_url?: string;
  episode_count?: number;
  follower_count?: number;
  youtube_subscribers?: number | null;
  bilibili_subscribers?: number | null;
  rss_subscribers?: number | null;
  tier?: "T1" | "T2" | "T3";
  category?: string;
  feed_url?: string;
  site_url?: string;
  youtube_channel_id?: string;
}

export async function seedPodcastCatalog(): Promise<{ added: number; updated: number; total: number }> {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/podcasts.json"), "utf8")) as {
    total: number;
    channels: SeedPodcastChannel[];
  };

  let added = 0;
  let updated = 0;

  for (const c of raw.channels) {
    const slug = c.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const followerClaim = c.youtube_subscribers
      ? `${(c.youtube_subscribers / 1000).toFixed(0)}K`
      : c.follower_count
      ? `${c.follower_count}`
      : "10K+";

    const res = await sql`
      INSERT INTO podcasts (
        id, slug, title, description, cover_url, episode_count, follower_count_claim,
        tier, category, feed_url, site_url, youtube_channel_id, enabled, updated_at
      ) VALUES (
        ${c.id}, ${slug}, ${c.name}, ${c.description ?? ""}, ${c.cover_url ?? null},
        ${c.episode_count ?? 0}, ${followerClaim}, ${c.tier ?? "T1"}, ${c.category ?? "ai-tech"},
        ${c.feed_url ?? null}, ${c.site_url ?? null}, ${c.youtube_channel_id ?? null}, true, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        cover_url = COALESCE(EXCLUDED.cover_url, podcasts.cover_url),
        episode_count = GREATEST(podcasts.episode_count, EXCLUDED.episode_count),
        follower_count_claim = EXCLUDED.follower_count_claim,
        tier = EXCLUDED.tier,
        feed_url = COALESCE(EXCLUDED.feed_url, podcasts.feed_url),
        site_url = COALESCE(EXCLUDED.site_url, podcasts.site_url),
        youtube_channel_id = COALESCE(EXCLUDED.youtube_channel_id, podcasts.youtube_channel_id),
        updated_at = now()
      RETURNING (xmax = 0) AS inserted;
    `;

    if (res[0]?.inserted) {
      added++;
    } else {
      updated++;
    }
  }

  return { added, updated, total: raw.channels.length };
}

if (process.argv[1]?.includes("seed-podcasts")) {
  const stats = await seedPodcastCatalog();
  console.log(`podcasts: ${stats.added} added, ${stats.updated} updated (total configured: ${stats.total})`);
  await closeDb();
}
