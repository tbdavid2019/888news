// OpenRouter Decision Models leaderboard: tracks real-world request volume for decision/classification models.
// Fetched periodically (4x daily alongside leaderboard refresh) and cached in settings.
// Read-only reference board; never influences v17 capability consensus scores.
import * as cheerio from "cheerio";
import type {
  LbDecisionCategoryGroup,
  LbDecisionCategoryModel,
  LbDecisionEntry,
  LbDecisionMarketShareEntry,
  LbDecisionsBoardResponse,
} from "@aihot/contracts/leaderboard";
import { LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { modelSlug } from "./fetch/identity.ts";

export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/rankings/decisions";
export const OPENROUTER_CRITERION_URL =
  "https://openrouter.ai/api/frontend/v1/rankings/modality-category-rankings?routeSegment=decisions&dimension=criterion";
export const OPENROUTER_DOMAIN_URL =
  "https://openrouter.ai/api/frontend/v1/rankings/modality-category-rankings?routeSegment=decisions&dimension=domain";
const SETTINGS_KEY = "leaderboard.openrouter_decisions";

interface StoredOpenRouterDecisions {
  at: string;
  entries: LbDecisionEntry[];
  marketShare?: LbDecisionMarketShareEntry[];
  criteria?: LbDecisionCategoryGroup[];
  domains?: LbDecisionCategoryGroup[];
}

const COMPACT_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
};

/** Parses compact count strings like "891M requests", "51.4M", "2b", "12.5k" into numbers. */
export function parseCompactCount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/\s*requests?$/i, "").trim();
  const match = /^(\d+(?:\.\d+)?)\s*([kmbt])?$/i.exec(cleaned);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const suffix = match[2]?.toLowerCase();
  const mult = suffix ? (COMPACT_MULTIPLIERS[suffix] ?? 1) : 1;
  return Math.round(num * mult);
}

/** Parses the SSR Rank | Model | Author | requests | Change table from OpenRouter's /rankings/decisions page. */
export function parseOpenRouterDecisionsHtml(html: string): LbDecisionEntry[] {
  const $ = cheerio.load(html);
  const table = $("table.or-table")
    .filter((_, el) => {
      const headers = $(el)
        .find("thead th")
        .map((__, th) => $(th).text().trim().toLowerCase())
        .get();
      return (
        headers.length >= 4 &&
        headers[0] === "rank" &&
        headers[1] === "model" &&
        headers[2] === "author" &&
        headers[3] === "requests"
      );
    })
    .first();

  if (!table.length) return [];

  const entries: LbDecisionEntry[] = [];
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr)
      .find("td, th")
      .map((__, cell) => $(cell).text().trim())
      .get();
    if (cells.length < 4) return;
    const [rankRaw, nameRaw, authorRaw, requestsRaw, changeRaw] = cells as [
      string,
      string,
      string,
      string,
      string | undefined,
    ];
    const name = nameRaw.trim();
    if (!name || name.toLowerCase() === "others") return;

    const openrouterRank = Number.parseInt(rankRaw, 10);
    if (!Number.isFinite(openrouterRank) || openrouterRank <= 0) return;

    const author = authorRaw.trim();
    const slugTail = modelSlug(name);
    const id = author ? `${author}/${slugTail}` : slugTail;
    const requestsText = requestsRaw.trim();
    const change = changeRaw?.trim() || null;

    entries.push({
      rank: entries.length + 1,
      openrouterRank,
      id,
      name,
      author,
      requests: parseCompactCount(requestsText),
      requestsText,
      change,
      modelSlug: null,
    });
  });

  return entries;
}

/** Parses Table 1 (Author Market Share of requests) from OpenRouter's /rankings/decisions page. */
export function parseOpenRouterMarketShareHtml(html: string): LbDecisionMarketShareEntry[] {
  const $ = cheerio.load(html);
  const table = $("table.or-table, table")
    .filter((_, el) => {
      const headers = $(el)
        .find("thead th")
        .map((__, th) => $(th).text().trim().toLowerCase())
        .get();
      return headers.some((h) => h.includes("author")) && headers.some((h) => h.includes("share"));
    })
    .first();

  if (!table.length) return [];

  const list: LbDecisionMarketShareEntry[] = [];
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr)
      .find("td, th")
      .map((__, cell) => $(cell).text().trim())
      .get();
    if (cells.length < 3) return;
    const [rankRaw, authorRaw, shareRaw, changeRaw] = cells;
    const author = (authorRaw || "").trim();
    if (!author) return;

    const rankNum = Number.parseInt(rankRaw || "", 10);
    const rank = Number.isFinite(rankNum) && rankNum > 0 ? rankNum : null;

    const shareText = (shareRaw || "").trim();
    const shareNum = Number.parseFloat(shareText.replace(/%/g, "").trim());
    const sharePercent = Number.isFinite(shareNum) ? shareNum : null;

    const change = (changeRaw || "").trim() || null;

    list.push({
      rank,
      author,
      sharePercent,
      shareText,
      change,
    });
  });

  return list;
}

/** Extracts model metadata links (shortName, author) embedded in OpenRouter SSR HTML. */
export function extractModelLinks(html: string): Map<string, { name: string; author: string }> {
  const map = new Map<string, { name: string; author: string }>();
  if (!html) return map;

  const match = html.match(/\\?"modelLinks\\?"\s*:\s*\{/);
  if (!match || match.index == null) return map;

  const start = match.index + match[0].length;
  const chunk = html.slice(start, start + 200_000);
  const unescaped = chunk.replace(/\\"/g, "\"");

  const entryRegex = /"([a-zA-Z0-9_\-./]+)"\s*:\s*\{([^}]+)\}/g;
  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryRegex.exec(unescaped)) !== null) {
    const slug = entryMatch[1];
    const body = entryMatch[2];
    const nameMatch = body.match(/"(?:shortName|name)"\s*:\s*"([^"]+)"/);
    const authorMatch = body.match(/"author"\s*:\s*"([^"]+)"/);
    if (nameMatch && authorMatch && slug !== "modelLinks") {
      map.set(slug, { name: nameMatch[1].trim(), author: authorMatch[1].trim() });
    }
  }

  return map;
}

/** Automatically formats a model slug into author and clean readable name when not in modelLinks. */
export function formatModelSlugFallback(slug: string): { name: string; author: string } {
  if (!slug) return { name: "", author: "" };
  const parts = slug.split("/");
  const author = parts.length > 1 ? parts[0].trim() : "";
  const rawModel = parts.length > 1 ? parts.slice(1).join("/") : slug;

  // Strip trailing date suffixes like -20260917, -2026-09-17, etc.
  const withoutDate = rawModel
    .replace(/-\d{8}$/, "")
    .replace(/-20\d{2}-\d{2}-\d{2}$/, "")
    .trim();

  // Convert kebab/snake-case into title words
  const words = withoutDate
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "gpt") return "GPT";
      if (lower === "ai") return "AI";
      if (/^v\d+(\.\d+)?$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

  const name = words.join(" ") || rawModel;
  return { name, author };
}

/** Clamps and normalizes share values to 0..1 range (handling raw percentages > 1). */
export function normalizeShare(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  const val = raw > 1 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, val));
}

/** Parses the JSON payload from OpenRouter modality-category-rankings API. */
export function parseCategoryRankingsJson(
  jsonText: string,
  modelLinks: Map<string, { name: string; author: string }>,
): LbDecisionCategoryGroup[] {
  let json: {
    data?: {
      requests?: {
        categories?: Array<{
          value?: string;
          label?: string;
          shareOfTotal?: number;
          models?: Array<{ model?: string; share?: number; deltaPp?: number }>;
        }>;
      };
      spend?: {
        categories?: Array<{
          value?: string;
          label?: string;
          shareOfTotal?: number;
          models?: Array<{ model?: string; share?: number; deltaPp?: number }>;
        }>;
      };
    };
  };

  try {
    json = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const rawCategories = json.data?.requests?.categories ?? json.data?.spend?.categories ?? [];
  if (!Array.isArray(rawCategories)) return [];

  return rawCategories
    .filter((cat) => cat && typeof cat.value === "string" && cat.value.trim().length > 0)
    .map((cat) => {
      const value = cat.value!.trim();
      const label = (cat.label || value).trim();
      const shareOfTotal = normalizeShare(cat.shareOfTotal);

      const models: LbDecisionCategoryModel[] = Array.isArray(cat.models)
        ? cat.models
            .filter((m) => m && typeof m.model === "string" && m.model.trim().length > 0)
            .map((m) => {
              const slug = m.model!.trim();
              const fallback = formatModelSlugFallback(slug);
              const found = modelLinks.get(slug);
              return {
                model: slug,
                name: found?.name || fallback.name,
                author: found?.author || fallback.author,
                share: normalizeShare(m.share),
                deltaPp: typeof m.deltaPp === "number" && Number.isFinite(m.deltaPp) ? m.deltaPp : 0,
              };
            })
            .sort((a, b) => b.share - a.share)
        : [];

      return {
        value,
        label,
        shareOfTotal,
        models,
      };
    })
    .sort((a, b) => b.shareOfTotal - a.shareOfTotal);
}

export async function fetchCategoryRankings(
  url: string,
  modelLinks: Map<string, { name: string; author: string }>,
): Promise<LbDecisionCategoryGroup[] | null> {
  try {
    const res = await guardedFetch(url, {
      timeoutMs: 15_000,
      maxBytes: 4 * 1024 * 1024,
    });
    if (res.status !== 200) {
      console.warn(`[openrouter-decisions] Category rankings returned HTTP ${res.status} for ${url}`);
      return null;
    }
    return parseCategoryRankingsJson(res.text(), modelLinks);
  } catch (err) {
    console.warn(`[openrouter-decisions] Category rankings fetch error for ${url}:`, err);
    return null;
  }
}

let cachedDecisions: { value: LbDecisionsBoardResponse; checkedAt: number } | null = null;

export function invalidateOpenRouterDecisions(): void {
  cachedDecisions = null;
}

export async function syncOpenRouterDecisions(): Promise<{ modelsIndexed: number; at: string }> {
  const res = await guardedFetch(OPENROUTER_DECISIONS_URL, {
    timeoutMs: 30_000,
    maxBytes: 8 * 1024 * 1024,
  });
  if (res.status !== 200) {
    throw new Error(`OpenRouter decisions HTTP ${res.status}`);
  }
  const html = res.text();
  const entries = parseOpenRouterDecisionsHtml(html);
  if (!entries.length) {
    throw new Error("OpenRouter decisions: parsed 0 entries");
  }

  // Load existing stored data to prevent transient API failures from overwriting good data with empty arrays
  let existing: StoredOpenRouterDecisions | undefined;
  try {
    const [row] = await sql<{ value: StoredOpenRouterDecisions }[]>`
      SELECT value FROM settings WHERE key = ${SETTINGS_KEY}
    `;
    existing = row?.value;
  } catch {
    // Non-fatal if settings read fails
  }

  const parsedMarketShare = parseOpenRouterMarketShareHtml(html);
  const marketShare = parsedMarketShare.length > 0 ? parsedMarketShare : (existing?.marketShare ?? []);

  const modelLinks = extractModelLinks(html);

  const [criteriaFetched, domainsFetched] = await Promise.all([
    fetchCategoryRankings(OPENROUTER_CRITERION_URL, modelLinks),
    fetchCategoryRankings(OPENROUTER_DOMAIN_URL, modelLinks),
  ]);

  const criteria = criteriaFetched ?? existing?.criteria ?? [];
  const domains = domainsFetched ?? existing?.domains ?? [];

  const at = new Date().toISOString();
  const record: StoredOpenRouterDecisions = {
    at,
    entries,
    marketShare,
    criteria,
    domains,
  };
  await sql`
    INSERT INTO settings (key, value, updated_by)
    VALUES (${SETTINGS_KEY}, ${sql.json(record as never)}, 'worker')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now()`;

  invalidateOpenRouterDecisions();
  return { modelsIndexed: entries.length, at };
}

function matchModelSlug(knownSlugs: Set<string>, idOrName: string): string | null {
  const tail = idOrName.includes("/") ? idOrName.slice(idOrName.indexOf("/") + 1) : idOrName;
  const s1 = modelSlug(tail);
  const s2 = s1.replace(/-20\d{2}-?\d{2}-?\d{2}$/, "").replace(/-20\d{6}$/, "").replace(/-\d{8}$/, "");
  const s3 = s2.replace(/-v-(\d)/g, "-v$1");
  const s4 = s1.replace(/-v-(\d)/g, "-v$1");
  for (const candidate of [s1, s2, s3, s4]) {
    if (candidate && knownSlugs.has(candidate)) return candidate;
  }
  return null;
}

export async function loadOpenRouterDecisions(): Promise<LbDecisionsBoardResponse> {
  if (cachedDecisions && Date.now() - cachedDecisions.checkedAt < 60_000) {
    return cachedDecisions.value;
  }

  let stored: StoredOpenRouterDecisions | undefined;
  try {
    const [row] = await sql<{ value: StoredOpenRouterDecisions }[]>`SELECT value FROM settings WHERE key = ${SETTINGS_KEY}`;
    stored = row?.value;
  } catch (err) {
    if (cachedDecisions) return cachedDecisions.value;
    throw err;
  }

  let knownSlugs = new Set<string>();
  if (stored?.entries?.length) {
    try {
      const models = await sql<{ slug: string }[]>`
        SELECT DISTINCT m.slug
        FROM lb_models m
        JOIN lb_rankings r ON r.model_id = m.id
        JOIN lb_runs b ON b.id = r.run_id
        WHERE b.status = 'published' AND r.board = ANY(${[...LEADERBOARD_PUBLIC_BOARDS]})`;
      knownSlugs = new Set(models.map((m) => m.slug));
    } catch {
      // Non-fatal: still serve the decisions list without internal profile links if lb_models query fails.
    }
  }

  const entries: LbDecisionEntry[] = Array.isArray(stored?.entries)
    ? stored.entries.map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        change: entry.change ?? null,
        modelSlug: knownSlugs.size > 0 ? matchModelSlug(knownSlugs, entry.name || entry.id) : null,
      }))
    : [];

  const response: LbDecisionsBoardResponse = {
    updatedAt: stored?.at ?? null,
    sourceName: "OpenRouter Decisions",
    sourceUrl: OPENROUTER_DECISIONS_URL,
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    entries,
    marketShare: Array.isArray(stored?.marketShare) ? stored.marketShare : [],
    criteria: Array.isArray(stored?.criteria) ? stored.criteria : [],
    domains: Array.isArray(stored?.domains) ? stored.domains : [],
  };

  cachedDecisions = { value: response, checkedAt: Date.now() };
  return response;
}
