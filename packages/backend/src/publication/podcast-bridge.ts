// Bridges podcast channels and episodes into the primary sources, articles, and publications tables.
// Enables bi-directional integration: podcast intelligence appears in "AI 動態" (/all), "精選" (/),
// and category/topic feeds alongside articles and tweets.
import { sql } from "../db.ts";

export interface BridgePodcastsResult {
  sourcesUpserted: number;
  articlesBridged: number;
  publicationsBridged: number;
}

export async function bridgePodcastsToPublications(): Promise<BridgePodcastsResult> {
  // 1. Sync podcast channels into sources table
  const podcasts = await sql<{
    id: string;
    slug: string;
    title: string;
    author: string | null;
    description: string | null;
    cover_url: string | null;
    tier: string;
  }[]>`
    SELECT id, slug, title, author, description, cover_url, tier
    FROM podcasts
    WHERE enabled = true
  `;

  let sourcesUpserted = 0;
  for (const p of podcasts) {
    const sourceId = `pod_${p.id}`.slice(0, 80);
    await sql`
      INSERT INTO sources (
        id, name, kind, tier, participation_mode, site_fulltext, enabled, icon_url, updated_at
      ) VALUES (
        ${sourceId}, ${p.title}, 'external', ${p.tier === 'T1' ? 'T1' : 'T2'},
        'editorial', false, true, ${p.cover_url ?? null}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        icon_url = COALESCE(EXCLUDED.icon_url, sources.icon_url),
        tier = EXCLUDED.tier,
        updated_at = now()
    `;
    sourcesUpserted++;
  }

  // 2. Fetch podcast episodes with tickers and podcast metadata
  const episodes = await sql<{
    id: string;
    podcast_id: string;
    podcast_title: string;
    guid: string;
    url: string;
    title: string;
    title_zh: string | null;
    summary_zh: string | null;
    published_at: Date;
    created_at: Date;
    audio_url: string | null;
    audio_duration_sec: number | null;
    audio_duration_str: string | null;
    hosts: string[];
    guests: string[];
    language: string;
    key_points: string[];
    score: number | string | null;
    selected: boolean;
    search_text: string;
  }[]>`
    SELECT
      e.id,
      e.podcast_id,
      p.title AS podcast_title,
      e.guid,
      e.url,
      e.title,
      e.title_zh,
      e.summary_zh,
      e.published_at,
      e.created_at,
      e.audio_url,
      e.audio_duration_sec,
      e.audio_duration_str,
      e.hosts,
      e.guests,
      e.language,
      e.key_points,
      e.score,
      e.selected,
      e.search_text
    FROM podcast_episodes e
    JOIN podcasts p ON p.id = e.podcast_id
    ORDER BY e.published_at DESC
  `;

  let articlesBridged = 0;
  let publicationsBridged = 0;

  for (const ep of episodes) {
    const cleanId = ep.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 70);
    const articleId = `pod_${cleanId}`.slice(0, 80);
    const sourceId = `pod_${ep.podcast_id}`.slice(0, 80);
    const identityKey = `podcast:${ep.podcast_id}:${ep.guid}`.slice(0, 200);

    const displayTitle = ep.title_zh || ep.title;
    const originalTitle = ep.title;
    const summary = ep.summary_zh || "";
    const numScore = ep.score !== null ? Number(ep.score) : 85;
    const isSelected = ep.selected || numScore >= 80;

    // Filter and sanitize tags
    const tags = Array.from(new Set([
      "專家觀點",
      "Podcast",
      ...(ep.key_points || []).slice(0, 4),
    ])).filter(Boolean);

    const rawMeta = {
      podcastId: ep.podcast_id,
      podcastTitle: ep.podcast_title,
      audioUrl: ep.audio_url,
      durationStr: ep.audio_duration_str,
      durationSec: ep.audio_duration_sec,
      hosts: ep.hosts,
      guests: ep.guests,
    };

    // 2a. Insert/update articles
    await sql`
      INSERT INTO articles (
        id, source_id, identity_key, url, title, author, language,
        published_at, published_at_claim, discovered_at, timeline_at,
        excerpt, body_text, body_status, raw, updated_at
      ) VALUES (
        ${articleId}, ${sourceId}, ${identityKey},
        ${ep.url || ep.audio_url || "https://888news.david888.com/podcast/recommend"},
        ${displayTitle},
        ${ep.hosts?.[0] || ep.podcast_title},
        ${ep.language || "en"},
        ${ep.published_at},
        ${ep.published_at},
        ${ep.created_at || new Date()},
        ${ep.published_at},
        ${(summary || displayTitle).slice(0, 500)},
        ${summary},
        'ok',
        ${JSON.stringify(rawMeta)},
        now()
      )
      ON CONFLICT (identity_key) DO UPDATE SET
        title = EXCLUDED.title,
        excerpt = EXCLUDED.excerpt,
        body_text = EXCLUDED.body_text,
        raw = EXCLUDED.raw,
        updated_at = now()
    `;
    articlesBridged++;

    // 2b. Insert/update analyses
    const analysisRows = await sql<{ id: string }[]>`
      INSERT INTO analyses (
        article_id, input_revision, origin, relevance, category,
        tags, title_zh, summary_zh, score, selected, created_at
      ) VALUES (
        ${articleId}, 1, 'rule', 'pass', 'opinion',
        ${tags}, ${displayTitle}, ${summary},
        ${numScore}, ${isSelected}, now()
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    const analysisId = analysisRows[0]?.id ? Number(analysisRows[0].id) : null;

    // 2c. Insert/update publications
    const searchText = `${displayTitle} ${originalTitle} ${summary} ${ep.search_text || ""}`.slice(0, 3000);

    await sql`
      INSERT INTO publications (
        article_id, analysis_id, revision, visibility, eligible, selected,
        title, original_title, summary, reason, category, tags, score,
        source_id, channel, first_party, url, published_at, discovered_at,
        timeline_at, sort_at, visible_after, body_mode, syndicate, indexable,
        search_text, updated_at
      ) VALUES (
        ${articleId}, ${analysisId}, 1, 'public',
        true,
        ${isSelected},
        ${displayTitle},
        ${originalTitle},
        ${summary},
        'Podcast 專家深度對談與行業洞察',
        'opinion',
        ${tags},
        ${numScore},
        ${sourceId},
        'news',
        false,
        ${ep.url || ep.audio_url || "https://888news.david888.com/podcast/recommend"},
        ${ep.published_at},
        ${ep.created_at || new Date()},
        ${ep.published_at},
        ${ep.published_at},
        now(),
        'summary',
        false,
        true,
        ${searchText},
        now()
      )
      ON CONFLICT (article_id) DO UPDATE SET
        title = EXCLUDED.title,
        original_title = EXCLUDED.original_title,
        summary = EXCLUDED.summary,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        score = EXCLUDED.score,
        eligible = EXCLUDED.eligible,
        selected = EXCLUDED.selected,
        search_text = EXCLUDED.search_text,
        updated_at = now()
    `;
    publicationsBridged++;
  }

  return { sourcesUpserted, articlesBridged, publicationsBridged };
}
