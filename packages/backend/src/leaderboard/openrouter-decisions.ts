// OpenRouter Decision Models leaderboard: tracks real-world request volume for decision/classification models.
// Fetched periodically (4x daily alongside leaderboard refresh) and cached in settings.
// Read-only reference board; never influences v17 capability consensus scores.
import * as cheerio from "cheerio";
import type { LbDecisionEntry, LbDecisionsBoardResponse } from "@aihot/contracts/leaderboard";
import { LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { modelSlug } from "./fetch/identity.ts";

export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/rankings/decisions";
const SETTINGS_KEY = "leaderboard.openrouter_decisions";

interface StoredOpenRouterDecisions {
  at: string;
  entries: LbDecisionEntry[];
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
  const entries = parseOpenRouterDecisionsHtml(res.text());
  if (!entries.length) {
    throw new Error("OpenRouter decisions: parsed 0 entries");
  }

  const at = new Date().toISOString();
  const record: StoredOpenRouterDecisions = { at, entries };
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
  };

  cachedDecisions = { value: response, checkedAt: Date.now() };
  return response;
}
