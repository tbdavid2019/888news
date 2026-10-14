// Ingests real episodes from BigGo finance API into podcast_episodes table
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

async function main() {
  let episodes: any[] = [];
  const localFile = path.join(REPO_ROOT, "industry/sample-episodes.json");
  if (existsSync(localFile)) {
    console.log("Loading episodes from local sample-episodes.json...");
    const json = JSON.parse(readFileSync(localFile, "utf8"));
    episodes = json.data?.episodes ?? [];
  } else {
    console.log("Fetching live episodes from BigGo Finance API...");
    const res = await guardedFetch("https://api.biggo.com/api/v1/finance/podcast/list?limit=50", { timeoutMs: 15000 });
    if (res.status === 200) {
      const json = JSON.parse(res.text());
      episodes = json.data?.episodes ?? [];
    }
  }

  console.log(`Processing ${episodes.length} episodes.`);
  let inserted = 0;

  for (const ep of episodes) {
    const epId = ep.id;
    const podcastId = ep.source_id;
    const publishedAt = new Date(ep.published_at * 1000);
    const durationSec = Math.round(ep.duration || 0);
    const m = Math.floor(durationSec / 60);
    const s = durationSec % 60;
    const durationStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    // Sample audio stream for interactive testing
    const audioUrl = ep.audio_url || "https://traffic.libsyn.com/secure/founders/sample.mp3";

    // Extract speaker names cleanly
    const speakers = (ep.speakers || []).map((s: any) => typeof s === "string" ? s : s?.name || s?.title).filter(Boolean);

    await sql`
      INSERT INTO podcast_episodes (
        id, podcast_id, guid, url, title, title_zh, published_at, audio_url,
        audio_duration_sec, audio_duration_str, hosts, guests, language,
        summary_zh, key_points, cover_url, selected, score, updated_at
      ) VALUES (
        ${epId}, ${podcastId}, ${ep.id}, ${ep.url}, ${ep.title}, ${ep.title},
        ${publishedAt}, ${audioUrl}, ${durationSec}, ${durationStr},
        ${speakers}, ${[]}, ${ep.language || "zh-TW"},
        ${ep.summary || ep.quick_take || ""}, ${ep.topics || []},
        ${ep.source_image_url || null}, true, 85, now()
      )
      ON CONFLICT (podcast_id, guid) DO UPDATE SET
        title = EXCLUDED.title,
        title_zh = EXCLUDED.title_zh,
        hosts = EXCLUDED.hosts,
        summary_zh = EXCLUDED.summary_zh,
        key_points = EXCLUDED.key_points,
        selected = true,
        score = 85,
        updated_at = now()
    `;

    // Associate company tickers
    if (Array.isArray(ep.companies)) {
      for (const comp of ep.companies) {
        if (comp.symbol) {
          await sql`
            INSERT INTO podcast_episode_tickers (episode_id, ticker, entity_id)
            VALUES (${epId}, ${comp.symbol}, ${comp.name || comp.symbol})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    inserted++;
  }

  console.log(`Successfully synced and selected ${inserted} podcast episodes.`);
  await closeDb();
}

main().catch((err) => {
  console.error("Error in sync-biggo-episodes:", err);
  process.exit(1);
});
