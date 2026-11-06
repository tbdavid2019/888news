// OpenRouter developer usage rankings: tracks real-world token consumption and popularity.
// Fetched periodically (4x daily alongside leaderboard refresh) and cached in settings.
// Read-only on leaderboard views; never influences capability consensus scores.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LbMarketStats } from "@aihot/contracts/leaderboard";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { modelSlug } from "./fetch/identity.ts";

const SETTINGS_KEY = "leaderboard.openrouter_rankings";
export const SEED_FILE = path.join(REPO_ROOT, "database/seeds/lb-openrouter-rankings.json");

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

let cachedSeedRankings: Record<string, LbMarketStats> | null = null;

export function loadSeedRankings(): Record<string, LbMarketStats> {
  if (cachedSeedRankings) return cachedSeedRankings;
  try {
    const raw = readFileSync(SEED_FILE, "utf8");
    const body = JSON.parse(raw) as { data?: OpenRouterRankingItem[] };
    const items = Array.isArray(body.data) ? body.data : [];
    if (!items.length) return {};
    const sampleDate = items[0]?.date ? items[0].date.slice(0, 10) : null;
    cachedSeedRankings = indexOpenRouterRankings(items, sampleDate);
    return cachedSeedRankings;
  } catch (err) {
    console.error("Failed to load OpenRouter seed rankings:", err);
    return {};
  }
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
    const s5 = s2.replace(/^claude-(\d+(?:-\d+)?)-([a-z]+)/, "claude-$2-$1");
    const s6 = s2.replace(/^claude-([a-z]+)-(\d+(?:-\d+)?)/, "claude-$2-$1");

    for (const key of [s1, s2, s3, s4, s5, s6]) {
      if (key && !indexed[key]) indexed[key] = stats;
    }
  }

  return indexed;
}

export async function syncOpenRouterRankings(options?: { forceSeed?: boolean }): Promise<{ modelsIndexed: number; date: string | null }> {
  if (!options?.forceSeed) {
    let fetchedItems: OpenRouterRankingItem[] | null = null;
    try {
      const res = await guardedFetch("https://openrouter.ai/api/frontend/v1/rankings/models", {
        timeoutMs: 30_000,
        maxBytes: 16 * 1024 * 1024,
      });
      if (res.status === 200) {
        const body = JSON.parse(res.text()) as { data?: OpenRouterRankingItem[] };
        if (Array.isArray(body.data) && body.data.length > 0) {
          fetchedItems = body.data;
        }
      }
    } catch {
      // Network fetch failure: fallback to seed below
    }

    if (fetchedItems) {
      const sampleDate = fetchedItems[0]?.date ? fetchedItems[0].date.slice(0, 10) : null;
      const models = indexOpenRouterRankings(fetchedItems, sampleDate);
      const now = new Date().toISOString();

      const record: StoredOpenRouterRankings = {
        at: now,
        date: sampleDate,
        count: fetchedItems.length,
        models: models as never,
      };

      await sql`
        INSERT INTO settings (key, value, updated_by)
        VALUES (${SETTINGS_KEY}, ${sql.json(record as never)}, 'worker')
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = now()`;

      invalidateOpenRouterRankings();
      return { modelsIndexed: Object.keys(models).length, date: sampleDate };
    }
  }

  // Fallback to local seed file if network fetch fails or forceSeed is requested
  const seed = loadSeedRankings();
  const count = Object.keys(seed).length;
  if (!count) throw new Error("OpenRouter rankings: fetch failed and seed data unavailable");

  const sampleDate = Object.values(seed)[0]?.date ?? null;
  const record: StoredOpenRouterRankings = {
    at: new Date().toISOString(),
    date: sampleDate,
    count,
    models: seed as never,
  };

  if (options?.forceSeed) {
    await sql`
      INSERT INTO settings (key, value, updated_by)
      VALUES (${SETTINGS_KEY}, ${sql.json(record as never)}, 'seed')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now()`;
  } else {
    // Graceful fallback on network failure: only seed if empty to preserve newer DB records
    await sql`
      INSERT INTO settings (key, value, updated_by)
      VALUES (${SETTINGS_KEY}, ${sql.json(record as never)}, 'seed')
      ON CONFLICT (key) DO NOTHING`;
  }

  invalidateOpenRouterRankings();
  return { modelsIndexed: count, date: sampleDate };
}

async function persistSeedToDb(models: Record<string, LbMarketStats>): Promise<void> {
  const count = Object.keys(models).length;
  if (count === 0) return;
  const sampleDate = Object.values(models)[0]?.date ?? null;
  const record: StoredOpenRouterRankings = {
    at: new Date().toISOString(),
    date: sampleDate,
    count,
    models: models as never,
  };
  await sql`
    INSERT INTO settings (key, value, updated_by)
    VALUES (${SETTINGS_KEY}, ${sql.json(record as never)}, 'seed')
    ON CONFLICT (key) DO NOTHING`;
}

let cachedRankingsMap: { map: Map<string, LbMarketStats>; checkedAt: number } | null = null;

export function invalidateOpenRouterRankings(): void {
  cachedRankingsMap = null;
}

export async function loadOpenRouterRankings(): Promise<Map<string, LbMarketStats>> {
  if (cachedRankingsMap && Date.now() - cachedRankingsMap.checkedAt < 60_000) {
    return cachedRankingsMap.map;
  }

  const out = new Map<string, LbMarketStats>();

  // Baseline foundation: seed rankings ensure at least 1,170+ models are always present
  const seed = loadSeedRankings();
  for (const [key, v] of Object.entries(seed)) {
    out.set(key, v);
  }

  let row: { value: StoredOpenRouterRankings } | undefined;
  try {
    const rows = await sql<{ value: StoredOpenRouterRankings }[]>`SELECT value FROM settings WHERE key = ${SETTINGS_KEY}`;
    row = rows[0];
  } catch {
    // DB query failed (e.g. cold start, offline, testing without db)
  }

  const dbModels = row?.value?.models;
  const hasDbModels = dbModels && Object.keys(dbModels).length > 0;

  if (hasDbModels) {
    // DB Overlay: overlay baseline with latest database rankings
    const dbDate = row?.value?.date ?? null;
    for (const [key, v] of Object.entries(dbModels)) {
      const rawRank = (v as { openrouterRank?: unknown; rank?: unknown }).openrouterRank ?? (v as { openrouterRank?: unknown; rank?: unknown }).rank ?? null;
      out.set(key, {
        openrouterRank: rawRank != null && Number.isFinite(Number(rawRank)) ? Number(rawRank) : null,
        totalTokens: v.totalTokens != null && Number.isFinite(Number(v.totalTokens)) ? Number(v.totalTokens) : null,
        totalRequests: v.totalRequests != null && Number.isFinite(Number(v.totalRequests)) ? Number(v.totalRequests) : null,
        permaslug: v.permaslug,
        date: dbDate ?? (v as { date?: string | null }).date ?? null,
      });
    }
  }

  cachedRankingsMap = { map: out, checkedAt: Date.now() };
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
