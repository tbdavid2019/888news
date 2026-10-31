// Scheduled synchronization of podcast feeds.
// Respects Zero-Disk policy: text and metadata only.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { sql } from "../db.ts";
import { REPO_ROOT } from "../config.ts";
import { parsePodcastFeedXml } from "./podcast-rss.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { bridgePodcastsToPublications } from "../publication/podcast-bridge.ts";
import { ENTITIES } from "@aihot/industry/taxonomy";
import { parseTableLines } from "../content/sanitize.ts";

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
      const tableMatch = t.includes("|") ? parseTableLines(t.split("\n")) : null;
      if (tableMatch) {
        const lines = t.split("\n");
        const beforeLines = lines.slice(0, tableMatch.startIdx).map((l) => l.trim()).filter(Boolean);
        const afterLines = lines.slice(tableMatch.endIdx).map((l) => l.trim()).filter(Boolean);
        const beforeHtml = beforeLines.length > 0 ? `<p>${beforeLines.map(inline).join("<br>")}</p>` : "";
        const afterHtml = afterLines.length > 0 ? `<p>${afterLines.map(inline).join("<br>")}</p>` : "";
        return `${beforeHtml}${tableMatch.tableHtml}${afterHtml}`;
      }
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

    const rawPub = ep.published_at ? new Date(ep.published_at * 1000) : new Date();
    const nowMs = Date.now();
    const publishedAt = Number.isFinite(rawPub.getTime()) && rawPub.getTime() <= nowMs + 3600_000 ? rawPub : new Date(nowMs);
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

    // Upsert episode (score is 65 for curated BigGo summaries with Chinese title, 58 otherwise; not auto-selected for main home feed)
    const defaultScore = ep.title_zh && summaryZh.length >= 40 ? 65 : 58;
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
        ${ep.source_image_url || null}, ${searchText}, true, ${defaultScore}, now()
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
        score = CASE WHEN podcast_episodes.score = 85 THEN EXCLUDED.score ELSE COALESCE(podcast_episodes.score, EXCLUDED.score) END,
        updated_at = now()
      RETURNING id;
    `;
    if (ins.length > 0) inserted++;

    // Associate company tickers and detected entities
    await associateEntitiesAndTickers(epId, searchText, ep.companies);
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsChinese(s: string): boolean {
  return /[\u4e00-\u9fa5]/.test(s);
}

export function matchAliasInText(alias: string, text: string, lowerText: string): boolean {
  const lowerAlias = alias.toLowerCase().trim();
  if (!lowerAlias) return false;

  // CJK characters: \b (ASCII word boundary) fails on Chinese; use substring check
  if (containsChinese(lowerAlias)) {
    return lowerText.includes(lowerAlias);
  }

  // Pure ASCII words: require word boundary to avoid false positives inside other words (e.g. AWS vs straws)
  if (/^[a-z0-9_-]+$/i.test(lowerAlias)) {
    const regex = new RegExp(`\\b${escapeRegExp(lowerAlias)}\\b`, "i");
    return regex.test(text);
  }

  // Terms with symbols (e.g. "Z.ai"): match bounded by non-alphanumeric or start/end
  const regex = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegExp(lowerAlias)}($|[^a-zA-Z0-9])`, "i");
  return regex.test(text);
}

export async function associateEntitiesAndTickers(
  epId: string,
  textToScan: string,
  explicitCompanies?: Array<{ name?: string; symbol?: string }>
): Promise<void> {
  const matchedTickers = new Map<string, string>(); // ticker -> entityId

  // 1. Process explicit companies if present (e.g. from BigGo)
  if (Array.isArray(explicitCompanies)) {
    for (const comp of explicitCompanies) {
      if (comp.symbol) {
        const sym = comp.symbol.toUpperCase();
        let entityId: string | null = null;
        const lowerName = (comp.name || "").toLowerCase().trim();

        for (const [taxId, taxDef] of Object.entries(ENTITIES)) {
          if (
            taxId === lowerName ||
            taxDef.name.toLowerCase() === lowerName ||
            taxDef.ticker?.symbol.toUpperCase() === sym ||
            taxDef.aliases.some((a) => a.toLowerCase() === lowerName || lowerName.includes(a.toLowerCase()))
          ) {
            entityId = taxId;
            break;
          }
        }

        // Only persist if entityId maps to a validated taxonomy entity
        if (entityId) {
          matchedTickers.set(sym, entityId);
        }
      }
    }
  }

  // 2. Scan text for known entities with tickers
  const lowerText = textToScan.toLowerCase();
  for (const [taxId, taxDef] of Object.entries(ENTITIES)) {
    if (!taxDef.ticker?.symbol) continue;
    const sym = taxDef.ticker.symbol.toUpperCase();
    if (matchedTickers.has(sym)) continue;

    const matches =
      lowerText.includes(taxDef.name.toLowerCase()) ||
      taxDef.aliases.some((alias) => matchAliasInText(alias, textToScan, lowerText));

    if (matches) {
      matchedTickers.set(sym, taxId);
    }
  }

  // 3. Persist to podcast_episode_tickers
  for (const [sym, entityId] of matchedTickers.entries()) {
    try {
      await sql`
        INSERT INTO podcast_episode_tickers (episode_id, ticker, entity_id)
        VALUES (${epId}, ${sym}, ${entityId})
        ON CONFLICT (episode_id, ticker) DO UPDATE SET entity_id = EXCLUDED.entity_id
      `;
    } catch (err) {
      console.warn(`Failed to link ticker ${sym} to episode ${epId}:`, err);
    }
  }
}

export interface SyncPodcastFeedsOptions {
  skipBigGo?: boolean;
  limitChannels?: number;
  batchSize?: number;
  maxEpisodesPerFeed?: number;
}

export async function syncPodcastFeeds(
  options: SyncPodcastFeedsOptions = {}
): Promise<{ synced: number; episodesAdded: number; episodesEnriched: number }> {
  let episodesAdded = 0;
  let episodesEnriched = 0;

  // 1. If BigGo is not skipped, attempt BigGo sync first (captures curated summaries & Chinese translations)
  if (!options.skipBigGo) {
    try {
      const biggoResult = await syncBigGoPodcastEpisodes();
      episodesAdded += biggoResult.inserted;
    } catch (err) {
      console.warn("BigGo podcast catalog sync failed or was unreachable; proceeding with official RSS feeds:", err);
    }
  }

  // 2. Query enabled podcasts with an official RSS feed URL or YouTube channel
  const allChannels = await sql<{
    id: string;
    feed_url: string | null;
    youtube_channel_id: string | null;
    title: string;
  }[]>`
    SELECT id, feed_url, youtube_channel_id, title FROM podcasts WHERE enabled = true AND (feed_url IS NOT NULL OR youtube_channel_id IS NOT NULL)
  `;

  const channels = options.limitChannels ? allChannels.slice(0, options.limitChannels) : allChannels;
  let synced = 0;
  const maxEpisodes = options.maxEpisodesPerFeed ?? 30;

  // Process channels concurrently in batches to balance speed and zero-disk / memory efficiency
  const batchSize = options.batchSize ?? 5;
  for (let i = 0; i < channels.length; i += batchSize) {
    const chunk = channels.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (c) => {
        const candidateUrls: string[] = [];
        if (c.feed_url) candidateUrls.push(c.feed_url);

        // If c.feed_url contains a UC... channel ID or is a YouTube/iipod URL, add native YouTube RSS as fallback
        const ucMatch = c.feed_url?.match(/UC[a-zA-Z0-9_-]{20,}/);
        if (ucMatch) {
          const ytUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ucMatch[0]}`;
          if (!candidateUrls.includes(ytUrl)) candidateUrls.push(ytUrl);
        }

        // If youtube_channel_id is set, also add native YouTube RSS as fallback
        if (c.youtube_channel_id) {
          const ytUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${c.youtube_channel_id}`;
          if (!candidateUrls.includes(ytUrl)) candidateUrls.push(ytUrl);
        }

        if (candidateUrls.length === 0) return;

        let xml: string | null = null;
        let successfulUrl: string | null = null;

        for (const url of candidateUrls) {
          try {
            const res = await guardedFetch(url, { timeoutMs: 25_000, maxBytes: 32 * 1024 * 1024 });
            if (res.status >= 200 && res.status < 300) {
              xml = res.text();
              successfulUrl = url;
              break;
            }
          } catch {
            // try next candidate feed URL
          }
        }

        if (!xml) {
          console.warn(`Failed to sync RSS/YouTube feeds for podcast ${c.id} (${c.title}); all candidate URLs failed:`, candidateUrls);
          await sql`UPDATE podcasts SET last_fetch_at = now() WHERE id = ${c.id}`.catch(() => {});
          return;
        }

        try {
          const parsed = parsePodcastFeedXml(xml);
          const episodesToProcess = parsed.episodes.slice(0, maxEpisodes);

          for (const ep of episodesToProcess) {
            if (!ep.title) continue;
            const guidHash = createHash("sha1").update(ep.guid || ep.link || ep.title).digest("hex").slice(0, 16);
            const epId = `${c.id}-${guidHash}`;
            const validAudioUrl = ep.audioUrl && ep.audioUrl.trim().length > 0 ? ep.audioUrl.trim() : null;
            const isYouTubeUrl = (value: string | null | undefined) => {
              if (!value) return false;
              try {
                const host = new URL(value).hostname.toLowerCase();
                return host === "youtube.com" || host.endsWith(".youtube.com");
              } catch {
                return false;
              }
            };
            const youtubeUrl = isYouTubeUrl(ep.link) ? ep.link : null;

            // Check if this episode already exists in database (e.g. from BigGo or previous RSS fetch)
            const existing = await sql<{ id: string; audio_url: string | null; body_html: string | null }[]>`
              SELECT id, audio_url, body_html FROM podcast_episodes
              WHERE podcast_id = ${c.id}
                AND (
                  guid = ${ep.guid}
                  OR (
                    published_at >= ${new Date(ep.publishedAt.getTime() - 48 * 3600 * 1000)}
                    AND published_at <= ${new Date(ep.publishedAt.getTime() + 48 * 3600 * 1000)}
                    AND (
                      (${ep.audioDurationSec ?? null}::int IS NOT NULL AND ABS(audio_duration_sec - ${ep.audioDurationSec ?? 0}) <= 90)
                      OR LOWER(title) = LOWER(${ep.title})
                    )
                  )
                )
              LIMIT 1;
            `.catch(() => []);

            if (existing.length > 0 && existing[0]) {
              const matched = existing[0];
              const shouldUpdateAudio = validAudioUrl && !matched.audio_url;
              const shouldUpdateBody = ep.showNotes && !matched.body_html;

              if (shouldUpdateAudio || shouldUpdateBody) {
                await sql`
                  UPDATE podcast_episodes
                  SET
                    audio_url = COALESCE(audio_url, ${validAudioUrl}),
                    audio_duration_sec = COALESCE(audio_duration_sec, ${ep.audioDurationSec ?? null}),
                    audio_duration_str = COALESCE(audio_duration_str, ${ep.audioDurationStr ?? null}),
                    body_text = COALESCE(body_text, ${ep.showNotes}),
                    body_html = COALESCE(body_html, ${ep.showNotes ? convertMarkdownToHtml(ep.showNotes) : null}),
                    cover_url = COALESCE(cover_url, ${ep.coverUrl ?? null}),
                    youtube_url = COALESCE(youtube_url, ${youtubeUrl}),
                    updated_at = now()
                  WHERE id = ${matched.id}
                `.catch((err) => console.warn(`Failed to enrich episode ${matched.id}:`, err));
                episodesEnriched++;
              }
              await associateEntitiesAndTickers(matched.id, `${ep.title} ${ep.showNotes}`);
              continue;
            }

            // Fresh episode ingested directly from official RSS or YouTube RSS feed
            const summaryText = ep.showNotes.slice(0, 500);
            const bodyText = ep.showNotes;
            const bodyHtml = ep.showNotes ? convertMarkdownToHtml(ep.showNotes) : null;
            const searchText = `${ep.title} ${ep.showNotes}`.slice(0, 2000).toLowerCase();
            const detectedLang = containsChinese(`${ep.title} ${ep.showNotes}`) ? "zh-TW" : "en";
            const episodeAudioUrl = validAudioUrl || ep.link || "https://888news.david888.com/podcast";

            const rawPub = ep.publishedAt ? new Date(ep.publishedAt) : new Date();
            const nowMs = Date.now();
            const safePublishedAt = Number.isFinite(rawPub.getTime()) && rawPub.getTime() <= nowMs + 3600_000 ? rawPub : new Date(nowMs);

            const ins = await sql<{ inserted: boolean }[]>`
              INSERT INTO podcast_episodes (
                id, podcast_id, guid, url, title, title_zh, published_at, audio_url,
                audio_duration_sec, audio_duration_str, hosts, guests, language,
                summary_zh, body_text, body_html, key_points, cover_url, search_text,
                youtube_url, selected, score, updated_at
              ) VALUES (
                ${epId}, ${c.id}, ${ep.guid}, ${ep.link || episodeAudioUrl}, ${ep.title}, ${ep.title},
                ${safePublishedAt}, ${episodeAudioUrl}, ${ep.audioDurationSec ?? null}, ${ep.audioDurationStr ?? null},
                ${ep.author ? [ep.author] : []}, ${[]}, ${detectedLang},
                ${summaryText}, ${bodyText}, ${bodyHtml}, ${[]},
                ${ep.coverUrl ?? null}, ${searchText},
                ${youtubeUrl}, true, 58, now()
              )
              ON CONFLICT (podcast_id, guid) DO UPDATE SET
                audio_url = COALESCE(podcast_episodes.audio_url, EXCLUDED.audio_url),
                audio_duration_sec = COALESCE(podcast_episodes.audio_duration_sec, EXCLUDED.audio_duration_sec),
                audio_duration_str = COALESCE(podcast_episodes.audio_duration_str, EXCLUDED.audio_duration_str),
                body_text = COALESCE(podcast_episodes.body_text, EXCLUDED.body_text),
                body_html = COALESCE(podcast_episodes.body_html, EXCLUDED.body_html),
                youtube_url = COALESCE(podcast_episodes.youtube_url, EXCLUDED.youtube_url),
                selected = true,
                score = CASE WHEN podcast_episodes.score = 85 THEN 58 ELSE COALESCE(podcast_episodes.score, 58) END,
                updated_at = now()
              RETURNING (xmax = 0) AS inserted;
            `.catch((err) => {
              console.warn(`Failed to insert episode ${epId}:`, err);
              return [];
            });

            if (ins.length > 0) {
              if (ins[0]?.inserted) {
                episodesAdded++;
              } else {
                episodesEnriched++;
              }
              await associateEntitiesAndTickers(epId, `${ep.title} ${ep.showNotes}`);
            }
          }

          await sql`
            UPDATE podcasts
            SET episode_count = (SELECT count(*)::int FROM podcast_episodes WHERE podcast_id = ${c.id}),
                last_fetch_at = now(),
                last_ok_at = now(),
                updated_at = now()
            WHERE id = ${c.id}
          `.catch(() => {});
          synced++;
        } catch (err) {
          console.warn(`Failed to sync RSS feed for podcast ${c.id} (${c.title}):`, err);
          await sql`UPDATE podcasts SET last_fetch_at = now() WHERE id = ${c.id}`.catch(() => {});
        }
      })
    );
  }

  if (episodesAdded > 0 || episodesEnriched > 0) {
    await bridgePodcastsToPublications().catch((err) => {
      console.error("Failed to bridge podcast episodes to publications:", err);
    });
  }

  return { synced, episodesAdded, episodesEnriched };
}
