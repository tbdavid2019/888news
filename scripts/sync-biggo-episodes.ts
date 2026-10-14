// Ingests real episodes from BigGo finance API into podcast_episodes table
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { ENTITIES } from "@aihot/industry/taxonomy";

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

    // Genuine audio stream if provided, otherwise null (canonical link preserved in ep.url)
    const audioUrl = ep.audio_url || null;

    // Extract speaker names cleanly
    const speakers = (ep.speakers || []).map((s: any) => typeof s === "string" ? s : s?.name || s?.title).filter(Boolean);

    // Combine topics and key_entities so search and filters find all real subjects
    const rawTopics = Array.isArray(ep.topics) ? ep.topics : [];
    const rawEntities = Array.isArray(ep.key_entities) ? ep.key_entities : [];
    const combinedKeyPoints = Array.from(new Set([...rawTopics, ...rawEntities]));

    const searchText = [
      ep.title,
      ep.title_zh,
      ep.summary,
      ep.quick_take,
      ...combinedKeyPoints,
      ...(ep.companies || []).map((c: any) => `${c.name || ""} ${c.symbol || ""}`),
      ...speakers,
    ].filter(Boolean).join(" ").toLowerCase();

    await sql`
      INSERT INTO podcast_episodes (
        id, podcast_id, guid, url, title, title_zh, published_at, audio_url,
        audio_duration_sec, audio_duration_str, hosts, guests, language,
        summary_zh, key_points, cover_url, search_text, selected, score, updated_at
      ) VALUES (
        ${epId}, ${podcastId}, ${ep.id}, ${ep.url}, ${ep.title}, ${ep.title},
        ${publishedAt}, ${audioUrl}, ${durationSec}, ${durationStr},
        ${speakers}, ${[]}, ${ep.language || "zh-TW"},
        ${ep.summary || ep.quick_take || ""}, ${combinedKeyPoints},
        ${ep.source_image_url || null}, ${searchText}, true, 85, now()
      )
      ON CONFLICT (podcast_id, guid) DO UPDATE SET
        url = EXCLUDED.url,
        audio_url = EXCLUDED.audio_url,
        title = EXCLUDED.title,
        title_zh = EXCLUDED.title_zh,
        hosts = EXCLUDED.hosts,
        summary_zh = EXCLUDED.summary_zh,
        key_points = EXCLUDED.key_points,
        search_text = EXCLUDED.search_text,
        selected = true,
        score = 85,
        updated_at = now()
    `;

    // Associate company tickers
    if (Array.isArray(ep.companies)) {
      for (const comp of ep.companies) {
        if (comp.symbol) {
          const sym = comp.symbol.toUpperCase();
          let entityId = comp.name || sym;
          const lowerName = (comp.name || "").toLowerCase();
          for (const [taxId, taxDef] of Object.entries(ENTITIES)) {
            if (
              taxId === lowerName ||
              taxDef.name.toLowerCase() === lowerName ||
              taxDef.ticker?.symbol.toUpperCase() === sym ||
              taxDef.aliases.some((a) => a.toLowerCase() === lowerName)
            ) {
              entityId = taxId;
              break;
            }
          }

          await sql`
            INSERT INTO podcast_episode_tickers (episode_id, ticker, entity_id)
            VALUES (${epId}, ${sym}, ${entityId})
            ON CONFLICT (episode_id, ticker) DO UPDATE SET entity_id = EXCLUDED.entity_id
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
