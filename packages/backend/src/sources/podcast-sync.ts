// Scheduled synchronization of podcast feeds.
// Respects Zero-Disk policy: text and metadata only.
import { sql } from "../db.ts";
import { parsePodcastFeedXml } from "./podcast-rss.ts";
import { guardedFetch } from "../lib/http-fetch.ts";

export async function syncPodcastFeeds(): Promise<{ synced: number; episodesAdded: number }> {
  // Query enabled podcasts with a feed URL
  const channels = await sql<{
    id: string;
    feed_url: string | null;
    title: string;
  }[]>`
    SELECT id, feed_url, title FROM podcasts WHERE enabled = true AND feed_url IS NOT NULL
  `;

  let synced = 0;
  let episodesAdded = 0;

  for (const c of channels) {
    if (!c.feed_url) continue;
    try {
      const res = await guardedFetch(c.feed_url, { timeoutMs: 15_000 });
      if (res.status < 200 || res.status >= 300) continue;
      const xml = res.text();
      const parsed = parsePodcastFeedXml(xml);

      for (const ep of parsed.episodes) {
        const epId = `${c.id}-${ep.guid}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 80);
        const ins = await sql`
          INSERT INTO podcast_episodes (
            id, podcast_id, guid, url, title, published_at, audio_url,
            audio_duration_sec, audio_duration_str, hosts, summary_zh,
            cover_url, search_text, updated_at
          ) VALUES (
            ${epId}, ${c.id}, ${ep.guid}, ${ep.link}, ${ep.title}, ${ep.publishedAt},
            ${ep.audioUrl}, ${ep.audioDurationSec ?? null}, ${ep.audioDurationStr ?? null},
            ${ep.author ? [ep.author] : []}, ${ep.showNotes.slice(0, 500)},
            ${ep.coverUrl ?? null}, ${`${ep.title} ${ep.showNotes}`.slice(0, 2000)}, now()
          )
          ON CONFLICT (podcast_id, guid) DO UPDATE SET
            title = EXCLUDED.title,
            audio_url = EXCLUDED.audio_url,
            audio_duration_sec = COALESCE(EXCLUDED.audio_duration_sec, podcast_episodes.audio_duration_sec),
            audio_duration_str = COALESCE(EXCLUDED.audio_duration_str, podcast_episodes.audio_duration_str),
            updated_at = now()
          RETURNING id;
        `;
        if (ins.length > 0) episodesAdded++;
      }

      await sql`
        UPDATE podcasts
        SET episode_count = (SELECT count(*)::int FROM podcast_episodes WHERE podcast_id = ${c.id}),
            last_fetch_at = now(),
            last_ok_at = now(),
            updated_at = now()
        WHERE id = ${c.id}
      `;
      synced++;
    } catch {
      await sql`UPDATE podcasts SET last_fetch_at = now() WHERE id = ${c.id}`.catch(() => {});
    }
  }

  return { synced, episodesAdded };
}
