// OpenRouter developer usage rankings: tracks real-world token consumption and popularity.
// Fetched periodically (4x daily alongside leaderboard refresh) and cached in settings.
// Read-only on leaderboard views; never influences capability consensus scores.
import type { LbMarketStats } from "@aihot/contracts/leaderboard";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { modelSlug } from "./fetch/identity.ts";

const SETTINGS_KEY = "leaderboard.openrouter_rankings";

interface OpenRouterRankingItem {
  date?: string;
  model_permaslug?: string;
  variant?: string;
  total_completion_tokens?: number;
  total_prompt_tokens?: number;
  count?: number;
  rankingMetricValue?: number;
}

interface StoredOpenRouterRankings {
  at: string;
  date: string | null;
  count: number;
  models: Record<string, {
    rank?: number;
    openrouterRank?: number;
    totalTokens: number | null;
    totalRequests: number | null;
    permaslug: string;
  }>;
}

export function indexOpenRouterRankings(data: OpenRouterRankingItem[], asOfDate?: string | null): Record<string, LbMarketStats> {
  // Sort descending by rankingMetricValue (total tokens) to ensure deterministic ranks.
  const sorted = [...data].sort((a, b) => (Number(b.rankingMetricValue) || 0) - (Number(a.rankingMetricValue) || 0));
  const indexed: Record<string, LbMarketStats> = {};

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    const rank = i + 1;
    const permaslug = item.model_permaslug?.trim() ?? "";
    if (!permaslug) continue;

    const totalTokens = Number.isFinite(item.rankingMetricValue) ? Number(item.rankingMetricValue) : null;
    const totalRequests = Number.isFinite(item.count) ? Number(item.count) : null;
    const date = asOfDate ?? (item.date ? item.date.slice(0, 10) : null);

    const stats: LbMarketStats = {
      openrouterRank: rank,
      totalTokens,
      totalRequests,
      permaslug,
      date,
    };

    const idTail = permaslug.includes("/") ? permaslug.slice(permaslug.indexOf("/") + 1) : permaslug;
    const s1 = modelSlug(idTail);
    const s2 = s1.replace(/-20\d{2}-?\d{2}-?\d{2}$/, "").replace(/-20\d{6}$/, "").replace(/-\d{8}$/, "");
    const s3 = s2.replace(/-v-(\d)/g, "-v$1");
    const s4 = s1.replace(/-v-(\d)/g, "-v$1");

    for (const key of [s1, s2, s3, s4]) {
      if (key && !indexed[key]) indexed[key] = stats;
    }
  }

  return indexed;
}

export async function syncOpenRouterRankings(): Promise<{ modelsIndexed: number; date: string | null }> {
  const res = await guardedFetch("https://openrouter.ai/api/frontend/v1/rankings/models", {
    timeoutMs: 30_000,
    maxBytes: 16 * 1024 * 1024,
  });
  if (res.status !== 200) throw new Error(`OpenRouter rankings HTTP ${res.status}`);

  const body = JSON.parse(res.text()) as { data?: OpenRouterRankingItem[] };
  const items = Array.isArray(body.data) ? body.data : [];
  if (!items.length) throw new Error("OpenRouter rankings: empty data");

  const sampleDate = items[0]?.date ? items[0].date.slice(0, 10) : null;
  const models = indexOpenRouterRankings(items, sampleDate);
  const now = new Date().toISOString();

  const record: StoredOpenRouterRankings = {
    at: now,
    date: sampleDate,
    count: items.length,
    models: models as never,
  };

  await sql`
    INSERT INTO settings (key, value, updated_by)
    VALUES (${SETTINGS_KEY}, ${sql.json(record as never)}, 'worker')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now()`;

  return { modelsIndexed: Object.keys(models).length, date: sampleDate };
}

export async function loadOpenRouterRankings(): Promise<Map<string, LbMarketStats>> {
  const [row] = await sql<{ value: StoredOpenRouterRankings }[]>`SELECT value FROM settings WHERE key = ${SETTINGS_KEY}`;
  const out = new Map<string, LbMarketStats>();
  if (!row?.value?.models) return out;

  for (const [key, v] of Object.entries(row.value.models)) {
    const rawRank = (v as { openrouterRank?: unknown; rank?: unknown }).openrouterRank ?? (v as { openrouterRank?: unknown; rank?: unknown }).rank ?? null;
    out.set(key, {
      openrouterRank: rawRank != null && Number.isFinite(Number(rawRank)) ? Number(rawRank) : null,
      totalTokens: v.totalTokens != null && Number.isFinite(Number(v.totalTokens)) ? Number(v.totalTokens) : null,
      totalRequests: v.totalRequests != null && Number.isFinite(Number(v.totalRequests)) ? Number(v.totalRequests) : null,
      permaslug: v.permaslug,
      date: row.value.date,
    });
  }
  return out;
}

export function matchMarketStats(map: Map<string, LbMarketStats>, slug: string): LbMarketStats | null {
  const direct = map.get(slug);
  if (direct) return direct;
  const sNorm = modelSlug(slug);
  const normHit = map.get(sNorm);
  if (normHit) return normHit;

  const stripFullDate = sNorm.replace(/-20\d{2}-?\d{2}-?\d{2}$/, "");
  if (stripFullDate !== sNorm && map.has(stripFullDate)) return map.get(stripFullDate)!;

  const stripShortDate = sNorm.replace(/-(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/, "");
  if (stripShortDate !== sNorm && map.has(stripShortDate)) return map.get(stripShortDate)!;

  return null;
}
