// Unified publication layer for Podcast channels, episodes, and financial tickers.
// Adheres strictly to: Single exit reading layer, anonymous reader views.
import { sql } from "../db.ts";
import { cached } from "../lib/cache.ts";
import { getCachedMarketQuotes } from "../providers/market.ts";
import { ENTITIES } from "@aihot/industry/taxonomy";

export interface PodcastChannelItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  episodeCount: number;
  followerClaim: string;
  tier: string;
  category: string;
}

export interface PodcastEpisodeItem {
  id: string;
  podcastId: string;
  url: string;
  podcastTitle: string;
  podcastCoverUrl: string | null;
  title: string;
  titleZh: string | null;
  publishedAt: string;
  audioUrl: string;
  audioDurationSec: number | null;
  audioDurationStr: string | null;
  hosts: string[];
  guests: string[];
  language: string;
  summaryZh: string | null;
  keyPoints: string[];
  coverUrl: string | null;
  score: number | null;
  tickers: Array<{
    ticker: string;
    name: string;
    price: number;
    changePercent: number;
  }>;
}

export async function loadPodcastChannels(params: {
  q?: string | null;
  category?: string | null;
} = {}): Promise<{ total: number; channels: PodcastChannelItem[] }> {
  const q = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";

  const rows = await sql<{
    id: string;
    slug: string;
    title: string;
    description: string;
    cover_url: string | null;
    episode_count: number;
    follower_count_claim: string;
    tier: string;
    category: string;
  }[]>`
    SELECT id, slug, title, description, cover_url, episode_count, follower_count_claim, tier, category
    FROM podcasts
    WHERE enabled = true
      AND (${q === ""} OR title ILIKE ${"%" + q + "%"} OR description ILIKE ${"%" + q + "%"})
      AND (${category === ""} OR category = ${category})
    ORDER BY episode_count DESC, created_at DESC
  `;

  return {
    total: rows.length,
    channels: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      coverUrl: r.cover_url,
      episodeCount: r.episode_count,
      followerClaim: r.follower_count_claim,
      tier: r.tier,
      category: r.category,
    })),
  };
}

export async function loadPodcastRecommend(params: {
  entity?: string | null;
  ticker?: string | null;
  channelId?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<{ total: number; episodes: PodcastEpisodeItem[] }> {
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);
  const entity = params.entity?.trim() ?? "";
  const ticker = params.ticker?.trim() ?? "";
  const channelId = params.channelId?.trim() ?? "";

  const rows = await sql<{
    id: string;
    podcast_id: string;
    url: string;
    podcast_title: string;
    podcast_cover: string | null;
    title: string;
    title_zh: string | null;
    published_at: Date;
    audio_url: string;
    audio_duration_sec: number | null;
    audio_duration_str: string | null;
    hosts: string[];
    guests: string[];
    language: string;
    summary_zh: string | null;
    key_points: string[];
    cover_url: string | null;
    score: string | number | null;
    tickers: string[] | null;
  }[]>`
    SELECT
      e.id,
      e.podcast_id,
      e.url,
      p.title AS podcast_title,
      p.cover_url AS podcast_cover,
      e.title,
      e.title_zh,
      e.published_at,
      e.audio_url,
      e.audio_duration_sec,
      e.audio_duration_str,
      e.hosts,
      e.guests,
      e.language,
      e.summary_zh,
      e.key_points,
      e.cover_url,
      e.score,
      COALESCE(
        ARRAY_AGG(pt.ticker) FILTER (WHERE pt.ticker IS NOT NULL),
        '{}'
      ) AS tickers
    FROM podcast_episodes e
    JOIN podcasts p ON p.id = e.podcast_id
    LEFT JOIN podcast_episode_tickers pt ON pt.episode_id = e.id
    WHERE e.selected = true
      AND (${channelId === ""} OR e.podcast_id = ${channelId} OR p.slug = ${channelId})
      AND (${ticker === ""} OR pt.ticker = ${ticker})
      AND (${entity === ""} OR pt.entity_id = ${entity})
    GROUP BY e.id, p.id
    ORDER BY e.published_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Collect all tickers for batch quote resolution
  const allTickers = Array.from(new Set(rows.flatMap((r) => r.tickers ?? [])));
  const quotes = await getCachedMarketQuotes(allTickers);

  const episodes: PodcastEpisodeItem[] = rows.map((r) => {
    const epTickers = (r.tickers ?? []).map((t) => {
      const q = quotes[t];
      return {
        ticker: t,
        name: q?.name ?? t,
        price: q?.price ?? 0,
        changePercent: q?.changePercent ?? 0,
      };
    });

    return {
      id: r.id,
      podcastId: r.podcast_id,
      url: r.url,
      podcastTitle: r.podcast_title,
      podcastCoverUrl: r.podcast_cover,
      title: r.title,
      titleZh: r.title_zh,
      publishedAt: r.published_at.toISOString(),
      audioUrl: r.audio_url,
      audioDurationSec: r.audio_duration_sec,
      audioDurationStr: r.audio_duration_str,
      hosts: r.hosts,
      guests: r.guests,
      language: r.language,
      summaryZh: r.summary_zh,
      keyPoints: r.key_points,
      coverUrl: r.cover_url,
      score: r.score ? Number(r.score) : null,
      tickers: epTickers,
    };
  });

  return { total: episodes.length, episodes };
}

export async function loadPodcastTickers(): Promise<
  Array<{ entityId: string; name: string; ticker: string; price: number; changePercent: number }>
> {
  const publicEntities = Object.entries(ENTITIES)
    .filter(([_, def]) => Boolean(def.ticker))
    .map(([id, def]) => ({
      entityId: id,
      name: def.name,
      ticker: def.ticker!.symbol,
    }));

  const quotes = await getCachedMarketQuotes(publicEntities.map((e) => e.ticker));

  return publicEntities.map((e) => {
    const q = quotes[e.ticker];
    return {
      entityId: e.entityId,
      name: e.name,
      ticker: e.ticker,
      price: q?.price ?? 0,
      changePercent: q?.changePercent ?? 0,
    };
  });
}
