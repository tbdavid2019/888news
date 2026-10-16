// Scheduled synchronization of podcast feeds.
// Respects Zero-Disk policy: text and metadata only.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "../db.ts";
import { REPO_ROOT } from "../config.ts";
import { parsePodcastFeedXml } from "./podcast-rss.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { bridgePodcastsToPublications } from "../publication/podcast-bridge.ts";
import { ENTITIES } from "@aihot/industry/taxonomy";

export interface SyncBigGoOptions {
  limit?: number;
  useFixtureOnly?: boolean;
  fetchDetailLimit?: number;
  targetEpisodeId?: string;
}

export interface BigGoEpisodeDetail {
  summary: string;
  quick_take?: string;
  topics?: string[];
  key_entities?: string[];
  business_highlights?: Array<{ insight: string }>;
  speakers?: Array<{ name: string; role?: string }>;
}

export function convertMarkdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const blocks = md.split(/\n{2,}/);
  return blocks
    .map((b) => {
      const t = b.trim();
      if (!t) return "";
      if (/^```/.test(t)) return `<pre><code>${esc(t.replace(/^```\w*\n?|```$/g, ""))}</code></pre>`;
      const h = /^(#{1,4})\s+(.+)$/.exec(t);
      if (h) return `<h${Math.min(h[1]!.length + 1, 4)}>${inline(h[2]!)}</h${Math.min(h[1]!.length + 1, 4)}>`;
      if (/^[-*]\s/.test(t)) return `<ul>${t.split("\n").map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      if (/^>\s?/.test(t)) return `<blockquote><p>${inline(t.replace(/^>\s?/gm, ""))}</p></blockquote>`;
      return `<p>${inline(t).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

export async function fetchBigGoEpisodeDetail(epId: string): Promise<BigGoEpisodeDetail | null> {
  const defaultUrl = `https://api.biggo.com/api/v1/finance/podcast/detail?episode_id=${epId}`;
  const proxyUrl = `https://biggo-podcast-proxy.oobwei.workers.dev/api/v1/finance/podcast/detail?episode_id=${epId}`;
  const targetUrls = process.env.BIGGO_PODCAST_API_URL
    ? [`${process.env.BIGGO_PODCAST_API_URL.replace(/\/list(\?.*)?$/, "/detail")}?episode_id=${epId}`]
    : [proxyUrl, defaultUrl];

  for (const u of targetUrls) {
    try {
      const res = await guardedFetch(u, { timeoutMs: 15_000 });
      if (res.status === 200) {
        const json = JSON.parse(res.text());
        if (json.result !== false && json.data?.summary) {
          return json.data;
        }
      }
    } catch (e) {
      console.warn(`BigGo podcast detail fetch failed for ${u}:`, e);
    }
  }
  return null;
}

export async function syncBigGoPodcastEpisodes(
  options: SyncBigGoOptions = {}
): Promise<{ total: number; inserted: number }> {
  const limit = options.limit ?? 100;
  let episodes: any[] = [];
  const localFile = path.join(REPO_ROOT, "industry/sample-episodes.json");

  if (options.useFixtureOnly) {
    if (existsSync(localFile)) {
      const json = JSON.parse(readFileSync(localFile, "utf8"));
      episodes = json.data?.episodes ?? [];
    }
  } else {
    try {
      const defaultUrl = `https://api.biggo.com/api/v1/finance/podcast/list?limit=${limit}`;
      const proxyUrl = `https://biggo-podcast-proxy.oobwei.workers.dev/api/v1/finance/podcast/list?limit=${limit}`;
      const targetUrls = process.env.BIGGO_PODCAST_API_URL
        ? [process.env.BIGGO_PODCAST_API_URL]
        : [proxyUrl, defaultUrl];

      for (const u of targetUrls) {
        try {
          const res = await guardedFetch(u, { timeoutMs: 15_000 });
          if (res.status === 200) {
            const json = JSON.parse(res.text());
            episodes = json.data?.episodes ?? [];
            if (episodes.length > 0) break;
          } else {
            console.warn(`BigGo podcast API (${u}) returned HTTP ${res.status}`);
          }
        } catch (e) {
          console.warn(`BigGo podcast API fetch failed for ${u}:`, e);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch live BigGo podcast API, falling back to local snapshot if present:", err);
      if (existsSync(localFile)) {
        const json = JSON.parse(readFileSync(localFile, "utf8"));
        episodes = json.data?.episodes ?? [];
      }
    }
  }

  if (episodes.length === 0) {
    return { total: 0, inserted: 0 };
  }

  let inserted = 0;
  const touchedPodcastIds = new Set<string>();
  const fetchDetailLimit = options.fetchDetailLimit ?? 20;
  let detailFetchedCount = 0;

  const episodeIds = episodes.map((e) => e.id).filter(Boolean);
  const existingEpisodes = episodeIds.length > 0 ? await sql<{ id: string; body_html: string | null }[]>`
    SELECT id, body_html FROM podcast_episodes WHERE id = ANY(${episodeIds})
  `.catch(() => []) : [];
  const existingBodyMap = new Map(existingEpisodes.map((r) => [r.id, r.body_html]));

  for (const ep of episodes) {
    if (!ep.id || !ep.source_id) continue;
    if (options.targetEpisodeId && ep.id !== options.targetEpisodeId) continue;
    const epId = ep.id;
    const podcastId = ep.source_id;
    touchedPodcastIds.add(podcastId);

    const publishedAt = new Date(ep.published_at * 1000);
    const durationSec = Math.round(ep.duration || 0);
    const m = Math.floor(durationSec / 60);
    const s = durationSec % 60;
    const durationStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    const audioUrl = ep.audio_url || null;
    const speakers = (ep.speakers || []).map((s: any) => (typeof s === "string" ? s : s?.name || s?.title)).filter(Boolean);

    const rawTopics = Array.isArray(ep.topics) ? ep.topics : [];
    const rawEntities = Array.isArray(ep.key_entities) ? ep.key_entities : [];
    const combinedKeyPoints = Array.from(new Set([...rawTopics, ...rawEntities]));

    let summaryZh = ep.summary || ep.quick_take || "";
    let fullBodyText: string | null = null;
    let fullBodyHtml: string | null = null;

    const needsDetail =
      !options.useFixtureOnly &&
      (!existingBodyMap.get(epId) || options.targetEpisodeId === epId) &&
      detailFetchedCount < fetchDetailLimit;

    if (needsDetail) {
      const detail = await fetchBigGoEpisodeDetail(epId);
      if (detail?.summary) {
        detailFetchedCount++;
        fullBodyText = detail.summary;
        fullBodyHtml = convertMarkdownToHtml(detail.summary);
        // The first block in detail summary is the complete, un-truncated lead paragraph
        const leadBlock = detail.summary.split(/\n{2,}/)[0]?.trim();
        summaryZh = leadBlock || detail.quick_take || ep.quick_take || ep.summary || "";
      }
    }

    // Defensive fallback if summary was truncated at 300 chars or ends mid-sentence
    if (!fullBodyText && (summaryZh.length === 300 || /[,，；;、\s]$/.test(summaryZh)) && ep.quick_take) {
      summaryZh = ep.quick_take;
    }

    const searchText = [
      ep.title,
      ep.title_zh,
      summaryZh,
      ep.quick_take,
      fullBodyText?.slice(0, 1000),
      ...combinedKeyPoints,
      ...(ep.companies || []).map((c: any) => `${c.name || ""} ${c.symbol || ""}`),
      ...speakers,
    ].filter(Boolean).join(" ").toLowerCase();

    // Ensure podcast channel exists in database
    await sql`
      INSERT INTO podcasts (
        id, slug, title, description, cover_url, episode_count, follower_count_claim, tier, category, enabled, updated_at
      ) VALUES (
        ${podcastId}, ${podcastId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")},
        ${ep.source_name || "Podcast"}, ${ep.source_description || ""}, ${ep.source_image_url || null},
        ${ep.source_episode_count || 0}, ${ep.source_follower_count ? `${ep.source_follower_count}` : "10K+"},
        'T1', 'ai-tech', true, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        cover_url = COALESCE(EXCLUDED.cover_url, podcasts.cover_url),
        updated_at = now()
    `;

    // Upsert episode
    const ins = await sql`
      INSERT INTO podcast_episodes (
        id, podcast_id, guid, url, title, title_zh, published_at, audio_url,
        audio_duration_sec, audio_duration_str, hosts, guests, language,
        summary_zh, body_text, body_html, key_points, cover_url, search_text, selected, score, updated_at
      ) VALUES (
        ${epId}, ${podcastId}, ${ep.id}, ${ep.url || ""}, ${ep.title}, ${ep.title_zh || ep.title},
        ${publishedAt}, ${audioUrl}, ${durationSec}, ${durationStr},
        ${speakers}, ${[]}, ${ep.language || "zh-TW"},
        ${summaryZh}, ${fullBodyText}, ${fullBodyHtml}, ${combinedKeyPoints},
        ${ep.source_image_url || null}, ${searchText}, true, 85, now()
      )
      ON CONFLICT (podcast_id, guid) DO UPDATE SET
        url = EXCLUDED.url,
        audio_url = EXCLUDED.audio_url,
        title = EXCLUDED.title,
        title_zh = EXCLUDED.title_zh,
        hosts = EXCLUDED.hosts,
        summary_zh = EXCLUDED.summary_zh,
        body_text = COALESCE(EXCLUDED.body_text, podcast_episodes.body_text),
        body_html = COALESCE(EXCLUDED.body_html, podcast_episodes.body_html),
        key_points = EXCLUDED.key_points,
        search_text = EXCLUDED.search_text,
        selected = true,
        score = 85,
        updated_at = now()
      RETURNING id;
    `;
    if (ins.length > 0) inserted++;

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
          `.catch(() => {});
        }
      }
    }
  }

  // Refresh counts on touched podcast channels
  for (const pid of touchedPodcastIds) {
    await sql`
      UPDATE podcasts
      SET episode_count = (SELECT count(*)::int FROM podcast_episodes WHERE podcast_id = ${pid}),
          last_fetch_at = now(),
          last_ok_at = now(),
          updated_at = now()
      WHERE id = ${pid}
    `.catch(() => {});
  }

  if (inserted > 0) {
    await bridgePodcastsToPublications().catch((err) => {
      console.error("Failed to bridge podcast episodes to publications:", err);
    });
  }

  return { total: episodes.length, inserted };
}

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

  // Also sync BigGo podcast catalog episodes
  const biggoResult = await syncBigGoPodcastEpisodes().catch((err) => {
    console.error("Failed to sync BigGo podcast episodes:", err);
    return { total: 0, inserted: 0 };
  });
  episodesAdded += biggoResult.inserted;

  if (episodesAdded > 0) {
    await bridgePodcastsToPublications().catch((err) => {
      console.error("Failed to bridge podcast episodes to publications:", err);
    });
  }

  return { synced, episodesAdded };
}
