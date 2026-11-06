// Official API prices (lb_prices kind='official') and catalog metadata sync.
// Curated dated files in database/seeds (lb-official-prices-YYYY-MM-DD.json) take top priority;
// models not covered by local seed files are automatically synced from first-party vendor listings
// in models.dev, falling back to OpenRouter's public catalog (with open-weight relay guards).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { cloakedModel, modelSlug } from "./fetch/identity.ts";
import weights from "./model-weights.json" with { type: "json" };
import { inferProvider, type Provider } from "./providers.ts";

const SEEDS = path.join(REPO_ROOT, "database/seeds");
const PRICE_FILE = /^lb-official-prices-\d{4}-\d{2}-\d{2}\.json$/;
const WEIGHT_REPOS = weights.models as Record<string, string>;

/** [currency, input, output, cached input, source url, note], per million tokens */
type Price = [string, number | null, number | null, number | null, string, string?];

export interface CatalogPrice {
  currency: "CNY" | "USD";
  input: number | null;
  output: number | null;
  cached: number | null;
  sourceUrl: string;
  verifiedOn: string;
  note: string | null;
}

export interface CatalogModelEntry {
  name: string;
  provider: Provider | null;
  contextWindow: number | null;
  price: CatalogPrice | null;
}

/** First-party vendor registries in models.dev (excludes third-party routers and subscription/coding plans). */
const MODELS_DEV_FIRST_PARTY: ReadonlyArray<readonly [string, string, string]> = [
  ["openai", "OpenAI", "openai"],
  ["anthropic", "Anthropic", "anthropic"],
  ["google", "Google", "google"],
  ["xai", "xAI", "xai"],
  ["deepseek", "DeepSeek", "deepseek"],
  ["alibaba", "Alibaba", "alibaba"],
  ["moonshotai", "Moonshot AI", "moonshot"],
  ["zai", "Z.ai", "z-ai"],
  ["minimax", "MiniMax", "minimax"],
  ["mistral", "Mistral AI", "mistral"],
  ["meta", "Meta", "meta"],
  ["cohere", "Cohere", "cohere"],
  ["xiaomi", "Xiaomi", "xiaomi"],
  ["stepfun-ai", "StepFun", "stepfun"],
  ["stepfun", "StepFun", "stepfun"],
  ["tencent-tokenhub", "Tencent", "tencent"],
  ["nvidia", "NVIDIA", "nvidia"],
];

const TRACKED_FIRST_PARTY_SLUGS = new Set<string>([
  ...MODELS_DEV_FIRST_PARTY.map(([, , slug]) => slug),
  "thinking-machines",
]);

function roundUsd(value: number): number {
  return Number(value.toPrecision(6));
}

function validIsoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Each model's newest curated entry, from one file or from every dated file (later files win). */
export function seededPrices(file?: string): Map<string, { verifiedOn: string; price: Price }> {
  const files = file ? [file] : readdirSync(SEEDS).filter((f) => PRICE_FILE.test(f)).sort().map((f) => path.join(SEEDS, f));
  const out = new Map<string, { verifiedOn: string; price: Price }>();
  for (const f of files) {
    const seed = JSON.parse(readFileSync(f, "utf8")) as { verifiedOn: string; prices: Record<string, Price> };
    for (const [slug, price] of Object.entries(seed.prices)) out.set(slug, { verifiedOn: seed.verifiedOn, price });
  }
  return out;
}

export async function importOfficialPrices(opts: { file?: string; overwrite?: boolean } = {}): Promise<{ written: number; unknown: string[] }> {
  let written = 0;
  const unknown: string[] = [];
  for (const [slug, { verifiedOn, price: [currency, input, output, cached, url, note] }] of seededPrices(opts.file)) {
    const [model] = await sql<{ id: string }[]>`SELECT id FROM lb_models WHERE slug = ${slug}`;
    if (!model) {
      unknown.push(slug);
      continue;
    }
    const res = await sql`
      INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on, note)
      VALUES (${model.id}, 'official', ${currency}, ${input}, ${output}, ${cached}, ${url}, ${verifiedOn}, ${note ?? null})
      ON CONFLICT (model_id, kind) DO ${opts.overwrite
        ? sql`UPDATE SET currency = EXCLUDED.currency, input = EXCLUDED.input, output = EXCLUDED.output, cached_input = EXCLUDED.cached_input,
                source_url = EXCLUDED.source_url, verified_on = EXCLUDED.verified_on, note = EXCLUDED.note, updated_at = now()`
        : sql`NOTHING`}`;
    written += res.count;
  }
  return { written, unknown };
}

interface ModelsDevModel {
  id?: string;
  name?: string;
  open_weights?: boolean;
  release_date?: string;
  last_updated?: string;
  limit?: { context?: number };
  cost?: { input?: number; output?: number; cache_read?: number };
}

interface ModelsDevProvider {
  name?: string;
  doc?: string;
  models?: Record<string, ModelsDevModel>;
}

interface OpenRouterModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input_cache_read?: string | number;
  };
}

export interface BuiltCatalog {
  entries: Map<string, CatalogModelEntry>;
  openWeightSlugs: Set<string>;
  resolve(slug: string): { entry: CatalogModelEntry; exact: boolean } | null;
}

/** Builds a normalized lookup of model display names, providers, context windows and official prices. */
export function buildLeaderboardCatalog(opts: {
  modelsDev?: Record<string, ModelsDevProvider> | null;
  openRouter?: { data?: OpenRouterModel[] } | null;
  today?: string;
}): BuiltCatalog {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const entries = new Map<string, CatalogModelEntry>();
  const openWeightSlugs = new Set<string>(Object.keys(WEIGHT_REPOS));

  if (opts.modelsDev) {
    for (const provider of Object.values(opts.modelsDev)) {
      for (const [id, m] of Object.entries(provider?.models ?? {})) {
        if (m?.open_weights) {
          const s1 = modelSlug(id);
          const s2 = m.name ? modelSlug(m.name.replace(/\s*\(latest\)\s*$/i, "")) : "";
          if (s1) openWeightSlugs.add(s1);
          if (s2) openWeightSlugs.add(s2);
        }
      }
    }

    for (const [vendorKey, provName, provSlug] of MODELS_DEV_FIRST_PARTY) {
      const vendor = opts.modelsDev[vendorKey];
      if (!vendor?.models) continue;
      const sourceUrl = vendor.doc || "https://models.dev";
      for (const [id, m] of Object.entries(vendor.models)) {
        if (!m || (id.includes("/") && !id.toLowerCase().startsWith(`${vendorKey}/`))) continue;
        const cleanName = String(m.name || id).replace(/\s*\(latest\)\s*$/i, "").trim();
        if (!cleanName || cloakedModel(id, cleanName)) continue;

        const rawIn = m.cost?.input;
        const rawOut = m.cost?.output;
        const hasPaidPrice = rawIn != null && rawOut != null && Number.isFinite(rawIn) && Number.isFinite(rawOut) && rawIn >= 0 && rawOut >= 0 && (rawIn > 0 || rawOut > 0);
        const verifiedOn = validIsoDate(m.last_updated) ?? validIsoDate(m.release_date) ?? today;

        let price: CatalogPrice | null = null;
        if (hasPaidPrice) {
          const rawCache = m.cost?.cache_read;
          const cached = rawCache != null && Number.isFinite(rawCache) && rawCache > 0 ? roundUsd(Number(rawCache)) : null;
          price = {
            currency: "USD",
            input: roundUsd(Number(rawIn)),
            output: roundUsd(Number(rawOut)),
            cached,
            sourceUrl,
            verifiedOn,
            note: null,
          };
        } else if (m.open_weights) {
          price = {
            currency: "USD",
            input: null,
            output: null,
            cached: null,
            sourceUrl,
            verifiedOn,
            note: "廠商公開權重，未提供官方付費 API",
          };
        }

        const contextWindow = Number.isInteger(m.limit?.context) && (m.limit?.context ?? 0) > 0 ? m.limit!.context! : null;
        const candidate: CatalogModelEntry = {
          name: cleanName,
          provider: { name: provName, slug: provSlug },
          contextWindow,
          price,
        };

        for (const s of [modelSlug(id), modelSlug(cleanName)]) {
          if (!s) continue;
          const prev = entries.get(s);
          if (!prev) {
            entries.set(s, candidate);
          } else {
            if (!prev.price && candidate.price) prev.price = candidate.price;
            if (!prev.contextWindow && candidate.contextWindow) prev.contextWindow = candidate.contextWindow;
          }
        }
      }
    }
  }

  for (const m of opts.openRouter?.data ?? []) {
    if (!m.id || !m.name || m.id.startsWith("~") || m.id.includes(":") || /^stealth\//i.test(m.id)) continue;
    if (/\((?:batch|fast|free|online|extended)\)\s*$/i.test(m.name) || cloakedModel(m.id, m.name)) continue;

    const cleanName = m.name.replace(/^[^:]{1,40}:\s*/, "").trim();
    if (!cleanName) continue;
    const vendorPrefix = m.name.includes(":") ? m.name.slice(0, m.name.indexOf(":")).trim() : null;
    const idTail = m.id.includes("/") ? m.id.slice(m.id.indexOf("/") + 1) : m.id;
    const slugs = [...new Set([modelSlug(cleanName), modelSlug(idTail)].filter(Boolean))];
    if (!slugs.length) continue;

    const provider = inferProvider(cleanName, vendorPrefix);
    const contextWindow = Number.isInteger(Number(m.context_length)) && Number(m.context_length) > 0 ? Number(m.context_length) : null;
    const isOpenWeight = slugs.some((s) => openWeightSlugs.has(s));

    const prompt = Number(m.pricing?.prompt);
    const completion = Number(m.pricing?.completion);
    const cacheRead = m.pricing?.input_cache_read != null ? Number(m.pricing.input_cache_read) : null;

    let orPrice: CatalogPrice | null = null;
    if (isOpenWeight && (!provider || TRACKED_FIRST_PARTY_SLUGS.has(provider.slug))) {
      const repoSlug = slugs.find((s) => WEIGHT_REPOS[s]);
      orPrice = {
        currency: "USD",
        input: null,
        output: null,
        cached: null,
        sourceUrl: repoSlug ? `https://huggingface.co/${WEIGHT_REPOS[repoSlug]}` : `https://openrouter.ai/${m.id}`,
        verifiedOn: today,
        note: "公開權重模型，廠商未單獨提供官方按量計費 API",
      };
    } else if (Number.isFinite(prompt) && Number.isFinite(completion) && prompt > 0 && completion > 0) {
      orPrice = {
        currency: "USD",
        input: roundUsd(prompt * 1e6),
        output: roundUsd(completion * 1e6),
        cached: cacheRead != null && Number.isFinite(cacheRead) && cacheRead > 0 ? roundUsd(cacheRead * 1e6) : null,
        sourceUrl: `https://openrouter.ai/${m.id}`,
        verifiedOn: today,
        note: null,
      };
    }

    for (const s of slugs) {
      const prev = entries.get(s);
      if (!prev) {
        entries.set(s, { name: cleanName, provider, contextWindow, price: orPrice });
      } else {
        if (!prev.price && orPrice) prev.price = orPrice;
        if (!prev.contextWindow && contextWindow) prev.contextWindow = contextWindow;
        if (!prev.provider && provider) prev.provider = provider;
      }
    }
  }

  const resolve = (slug: string): { entry: CatalogModelEntry; exact: boolean } | null => {
    const norm = modelSlug(slug);
    const direct = entries.get(slug) ?? (norm ? entries.get(norm) : undefined);
    if (direct) return { entry: direct, exact: true };
    const base = norm || slug;
    const stripFullDate = base.replace(/-20\d{2}-?\d{2}-?\d{2}$/, "");
    if (stripFullDate !== base && entries.has(stripFullDate)) return { entry: entries.get(stripFullDate)!, exact: false };
    const stripShortDate = base.replace(/-(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/, "");
    if (stripShortDate !== base && entries.has(stripShortDate)) return { entry: entries.get(stripShortDate)!, exact: false };
    return null;
  };

  return { entries, openWeightSlugs, resolve };
}

function sameNullableNumber(a: number | string | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - b) < 1e-6;
}

/**
 * Fetches models.dev and OpenRouter catalogs to automatically fill missing context windows,
 * normalize raw slug-like model names / missing providers, and sync official API prices for
 * models not manually pinned in database/seeds/lb-official-prices-*.json.
 */
export async function syncLeaderboardCatalog(opts: {
  modelsDev?: Record<string, ModelsDevProvider> | null;
  openRouter?: { data?: OpenRouterModel[] } | null;
  today?: string;
} = {}): Promise<{ pricesWritten: number; modelsUpdated: number; contextFilled: number }> {
  let modelsDev = opts.modelsDev;
  let openRouter = opts.openRouter;

  if (modelsDev === undefined && openRouter === undefined) {
    const [mdRes, orRes] = await Promise.allSettled([
      guardedFetch("https://models.dev/api.json", { timeoutMs: 30_000, maxBytes: 24 * 1024 * 1024 }).then((r) => {
        if (r.status !== 200) throw new Error(`models.dev HTTP ${r.status}`);
        return JSON.parse(r.text()) as Record<string, ModelsDevProvider>;
      }),
      guardedFetch("https://openrouter.ai/api/v1/models", { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 }).then((r) => {
        if (r.status !== 200) throw new Error(`openrouter HTTP ${r.status}`);
        return JSON.parse(r.text()) as { data?: OpenRouterModel[] };
      }),
    ]);
    modelsDev = mdRes.status === "fulfilled" ? mdRes.value : null;
    openRouter = orRes.status === "fulfilled" ? orRes.value : null;
    if (!modelsDev && !openRouter) {
      const err1 = mdRes.status === "rejected" ? (mdRes.reason as Error).message : "empty";
      const err2 = orRes.status === "rejected" ? (orRes.reason as Error).message : "empty";
      throw new Error(`catalog fetch failed: models.dev (${err1}); openrouter (${err2})`);
    }
  }

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const catalog = buildLeaderboardCatalog({ modelsDev, openRouter, today });
  const curatedSlugs = new Set(seededPrices().keys());

  const models = await sql<{
    id: string;
    slug: string;
    name: string;
    provider: string | null;
    provider_slug: string | null;
    context_window_tokens: number | null;
    metadata_source: string | null;
  }[]>`SELECT id, slug, name, provider, provider_slug, context_window_tokens, metadata_source FROM lb_models`;

  const existingPrices = new Map(
    (await sql<{
      model_id: string;
      currency: string;
      input: string | null;
      output: string | null;
      cached_input: string | null;
      source_url: string | null;
      note: string | null;
    }[]>`SELECT model_id, currency, input, output, cached_input, source_url, note FROM lb_prices WHERE kind = 'official'`).map((p) => [p.model_id, p]),
  );

  let pricesWritten = 0;
  let modelsUpdated = 0;
  let contextFilled = 0;

  for (const m of models) {
    const resolved = catalog.resolve(m.slug);
    const entry = resolved?.entry ?? null;

    const nextName =
      resolved?.exact &&
      entry &&
      m.metadata_source !== "directory" &&
      /^[a-z0-9._-]+$/.test(m.name) &&
      /[A-Z]/.test(entry.name)
        ? entry.name
        : m.name;

    const needsProvider = !m.provider || m.provider === "其他" || m.provider === "Other" || !m.provider_slug || m.provider_slug === "other";
    const inferred = needsProvider ? (entry?.provider ?? inferProvider(nextName)) : null;
    const nextProvider = inferred ? inferred.name : m.provider;
    const nextProviderSlug = inferred ? inferred.slug : m.provider_slug;
    const nextContext = m.context_window_tokens ?? entry?.contextWindow ?? null;

    if (nextName !== m.name || nextProvider !== m.provider || nextProviderSlug !== m.provider_slug || nextContext !== m.context_window_tokens) {
      await sql`
        UPDATE lb_models
        SET name = ${nextName},
            provider = ${nextProvider},
            provider_slug = ${nextProviderSlug},
            context_window_tokens = ${nextContext},
            metadata_source = CASE WHEN metadata_source = 'directory' THEN metadata_source ELSE 'catalog' END,
            metadata_updated_at = now(),
            updated_at = now()
        WHERE id = ${m.id}`;
      modelsUpdated += 1;
      if (m.context_window_tokens == null && nextContext != null) contextFilled += 1;
    }

    if (curatedSlugs.has(m.slug)) continue;

    let targetPrice = entry?.price ?? null;
    if (!targetPrice && WEIGHT_REPOS[m.slug] && !existingPrices.has(m.id)) {
      targetPrice = {
        currency: "USD",
        input: null,
        output: null,
        cached: null,
        sourceUrl: `https://huggingface.co/${WEIGHT_REPOS[m.slug]}`,
        verifiedOn: today,
        note: "公開權重模型，廠商未單獨提供官方按量計費 API",
      };
    }
    if (!targetPrice) continue;

    const cur = existingPrices.get(m.id);
    if (
      cur &&
      cur.currency === targetPrice.currency &&
      sameNullableNumber(cur.input, targetPrice.input) &&
      sameNullableNumber(cur.output, targetPrice.output) &&
      sameNullableNumber(cur.cached_input, targetPrice.cached) &&
      (cur.source_url ?? null) === targetPrice.sourceUrl &&
      (cur.note ?? null) === targetPrice.note
    ) {
      continue;
    }

    await sql`
      INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on, note, updated_at)
      VALUES (${m.id}, 'official', ${targetPrice.currency}, ${targetPrice.input}, ${targetPrice.output}, ${targetPrice.cached}, ${targetPrice.sourceUrl}, ${targetPrice.verifiedOn}, ${targetPrice.note}, now())
      ON CONFLICT (model_id, kind) DO UPDATE
      SET currency = EXCLUDED.currency,
          input = EXCLUDED.input,
          output = EXCLUDED.output,
          cached_input = EXCLUDED.cached_input,
          source_url = EXCLUDED.source_url,
          verified_on = EXCLUDED.verified_on,
          note = EXCLUDED.note,
          updated_at = now()`;
    pricesWritten += 1;
  }

  return { pricesWritten, modelsUpdated, contextFilled };
}
