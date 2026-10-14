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
  audioUrl: string | null;
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

const TAG_KEYWORD_MAP: Record<string, string[]> = {
  amazon: ["amazon", "amzn", "aws", "亞馬遜", "亚马逊"],
  google: ["google", "googl", "goog", "alphabet", "gemini", "deepmind", "谷歌"],
  meta: ["meta", "facebook", "llama"],
  microsoft: ["microsoft", "msft", "copilot", "微軟", "微软"],
  nvidia: ["nvidia", "nvda", "輝達", "英伟达"],
  apple: ["apple", "aapl", "蘋果", "苹果"],
  tsmc: ["tsmc", "2330", "2330.tw", "台積電"],
  uber: ["uber"],
  slack: ["slack"],
  claude: ["claude", "claude code", "anthropic"],
  anthropic: ["anthropic", "claude"],
  openai: ["openai", "chatgpt", "gpt", "sora"],
  gpt: ["gpt", "chatgpt", "gpt-4", "gpt-5"],
  github: ["github", "copilot"],
  codex: ["codex"],
  mcp: ["mcp", "model context protocol"],
  cursor: ["cursor", "anysphere"],
  gemini: ["gemini", "google"],
};

export async function loadPodcastRecommend(params: {
  entity?: string | null;
  ticker?: string | null;
  tag?: string | null;
  channelId?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<{ total: number; episodes: PodcastEpisodeItem[] }> {
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);
  const channelId = params.channelId?.trim() ?? "";

  const rawKey = (params.tag || params.entity || params.ticker || "").trim();
  const lowerKey = rawKey.toLowerCase();

  const searchKeywords: string[] = [];
  if (rawKey) {
    searchKeywords.push(rawKey, lowerKey);
    if (TAG_KEYWORD_MAP[lowerKey]) {
      searchKeywords.push(...TAG_KEYWORD_MAP[lowerKey]);
    }
    for (const [id, def] of Object.entries(ENTITIES)) {
      if (id === lowerKey || def.name.toLowerCase() === lowerKey || def.ticker?.symbol.toLowerCase() === lowerKey) {
        searchKeywords.push(id, def.name, def.name.toLowerCase());
        if (def.ticker) searchKeywords.push(def.ticker.symbol, def.ticker.symbol.toLowerCase());
        searchKeywords.push(...def.aliases.map((a) => a.toLowerCase()));
      }
    }
  }
  const uniqueKeywords = Array.from(new Set(searchKeywords.map((k) => k.trim()).filter(Boolean)));
  const searchPatterns = uniqueKeywords.map((k) => `%${k}%`);

  const rows = await sql<{
    id: string;
    podcast_id: string;
    url: string;
    podcast_title: string;
    podcast_cover: string | null;
    title: string;
    title_zh: string | null;
    published_at: Date;
    audio_url: string | null;
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
      AND (
        ${uniqueKeywords.length === 0}
        OR EXISTS (
          SELECT 1 FROM podcast_episode_tickers pt2
          WHERE pt2.episode_id = e.id
            AND (
              pt2.ticker ILIKE ANY(${uniqueKeywords})
              OR pt2.entity_id ILIKE ANY(${uniqueKeywords})
            )
        )
        OR EXISTS (
          SELECT 1 FROM unnest(e.key_points) kp
          WHERE kp ILIKE ANY(${searchPatterns})
        )
        OR e.title ILIKE ANY(${searchPatterns})
        OR e.title_zh ILIKE ANY(${searchPatterns})
        OR e.summary_zh ILIKE ANY(${searchPatterns})
        OR e.search_text ILIKE ANY(${searchPatterns})
      )
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
      audioUrl: r.audio_url || null,
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
  const targetEntities: Array<{ entityId: string; name: string; tickerSymbol?: string }> = [
    { entityId: "claude", name: "Claude" },
    { entityId: "openai", name: "OpenAI" },
    { entityId: "anthropic", name: "Anthropic" },
    { entityId: "gpt", name: "GPT" },
    { entityId: "github", name: "GitHub" },
    { entityId: "codex", name: "Codex" },
    { entityId: "mcp", name: "MCP" },
    { entityId: "google", name: "Google", tickerSymbol: "GOOGL" },
    { entityId: "nvidia", name: "NVIDIA", tickerSymbol: "NVDA" },
    { entityId: "cursor", name: "Cursor" },
    { entityId: "meta", name: "Meta", tickerSymbol: "META" },
    { entityId: "amazon", name: "Amazon", tickerSymbol: "AMZN" },
    { entityId: "gemini", name: "Gemini" },
    { entityId: "uber", name: "Uber", tickerSymbol: "UBER" },
    { entityId: "microsoft", name: "Microsoft", tickerSymbol: "MSFT" },
    { entityId: "slack", name: "Slack" },
    { entityId: "apple", name: "Apple", tickerSymbol: "AAPL" },
    { entityId: "tsmc", name: "台積電", tickerSymbol: "2330.TW" },
  ];

  const tickersToFetch = targetEntities.map((e) => e.tickerSymbol).filter(Boolean) as string[];
  const quotes = await getCachedMarketQuotes(tickersToFetch);

  return targetEntities.map((e) => {
    const q = e.tickerSymbol ? quotes[e.tickerSymbol] : undefined;
    return {
      entityId: e.entityId,
      name: e.name,
      ticker: e.tickerSymbol || "",
      price: q?.price ?? 0,
      changePercent: q?.changePercent ?? 0,
    };
  });
}
