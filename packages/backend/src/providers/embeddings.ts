// Text embeddings through receipts, used only for the event grouping's candidate recall. Any
// OpenAI-compatible /embeddings endpoint (EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL);
// or fallback to OPENAI_API_KEY / LLM_FALLBACK_3_API_KEY (text-embedding-3-small);
// or with a DashScope key, Aliyun text-embedding-v4 at 1024 dimensions. Without either,
// recall falls back to lexical similarity and citation graphs.
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";
import { sha256 } from "../lib/ids.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";

export interface EmbeddingConfig {
  available: boolean;
  service: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dims: number;
}

export function resolveEmbeddingConfig(): EmbeddingConfig {
  // 1. Explicit embedding credentials
  const explicitKey = credential("models", "EMBEDDING_API_KEY") || process.env.EMBEDDING_API_KEY;
  if (explicitKey) {
    return {
      available: true,
      service: "embedding",
      baseUrl: credential("models", "EMBEDDING_BASE_URL") || process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1",
      apiKey: explicitKey,
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      dims: Number(process.env.EMBEDDING_DIMS ?? 0),
    };
  }

  // 2. OpenAI / Fallback 3 keys
  const openaiKey =
    credential("models", "OPENAI_API_KEY") ||
    process.env.OPENAI_API_KEY ||
    credential("models", "OPENAI_DECISION_API_KEY") ||
    process.env.OPENAI_DECISION_API_KEY ||
    credential("models", "LLM_FALLBACK_3_API_KEY") ||
    process.env.LLM_FALLBACK_3_API_KEY;
  if (openaiKey) {
    return {
      available: true,
      service: "embedding",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: openaiKey,
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      dims: Number(process.env.EMBEDDING_DIMS ?? 0),
    };
  }

  // 3. DashScope (Aliyun)
  const dashscopeKey = credential("models", "DASHSCOPE_API_KEY") || process.env.DASHSCOPE_API_KEY;
  if (dashscopeKey) {
    return {
      available: true,
      service: "dashscope",
      baseUrl: credential("models", "DASHSCOPE_BASE_URL") || process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: dashscopeKey,
      model: process.env.EMBEDDING_MODEL || "text-embedding-v4",
      dims: Number(process.env.EMBEDDING_DIMS ?? 1024),
    };
  }

  return {
    available: false,
    service: "embedding",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    dims: Number(process.env.EMBEDDING_DIMS ?? 0),
  };
}

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || resolveEmbeddingConfig().model;
export const EMBEDDING_DIMS = Number(process.env.EMBEDDING_DIMS ?? resolveEmbeddingConfig().dims);

// Recall reads fresh fact/story titles on every call, so the full text hash also invalidates this
// cache when either title changes. Keep enough entries for the 4,000-fact recall window, not the
// unbounded article history. Expiry also picks up a stored-vector repair with an unchanged hash.
const FACT_CACHE_LIMIT = 4096;
const FACT_CACHE_TTL_MS = 5 * 60_000;
const factVectors = new Map<string, { textHash: string; vector: number[]; expiresAt: number }>();

function cacheFact(id: string, textHash: string, vector: number[]) {
  factVectors.delete(id);
  factVectors.set(id, { textHash, vector, expiresAt: Date.now() + FACT_CACHE_TTL_MS });
  if (factVectors.size > FACT_CACHE_LIMIT) factVectors.delete(factVectors.keys().next().value!);
}

/** Embeddings are paid model calls: MODEL_CALLS_ENABLED=false switches them off like every other call. */
export function embeddingsAvailable(): boolean {
  if (!config.modelCallsEnabled) return false;
  if (process.env.EMBEDDINGS_ENABLED === "false") return false;
  return resolveEmbeddingConfig().available;
}

async function embedBatch(texts: string[], subject: string): Promise<number[][]> {
  if (!config.modelCallsEnabled) throw new Error("Model calls are disabled (MODEL_CALLS_ENABLED=false)");
  const cfg = resolveEmbeddingConfig();
  if (!cfg.available || !cfg.apiKey) throw new Error("EMBEDDING_API_KEY (or OPENAI_API_KEY / DASHSCOPE_API_KEY) missing");

  const receipt = await paidRequest(
    {
      service: cfg.service,
      model: cfg.model,
      purpose: "embedding",
      subject,
      identity: { model: cfg.model, dims: cfg.dims, texts: texts.map((t) => sha256(t)) },
      requestSummary: { count: texts.length },
    },
    async () => {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          input: texts,
          ...(cfg.dims > 0 ? { dimensions: cfg.dims } : {}),
          encoding_format: "float",
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) throw new ProviderRejectedError(`embeddings HTTP ${res.status}: ${text.slice(0, 200)}`, res.status, res.status === 429 || res.status >= 500);
      const json = JSON.parse(text) as { data: Array<{ embedding: number[]; index: number }>; usage?: Record<string, unknown> };
      return { response: json, usage: json.usage ?? null, cost: null };
    },
  );
  const data = (receipt.response as { data: Array<{ embedding: number[]; index: number }> }).data;
  return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Returns stored embeddings, computing and storing the missing ones. */
export async function ensureEmbeddings(kind: "fact" | "article" | "story", items: Array<{ id: string; text: string }>): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (items.length === 0) return out;
  const cfg = resolveEmbeddingConfig();
  const hashes = new Map(items.map((item) => [item.id, sha256(item.text)]));
  const now = Date.now();
  const uncached = items.filter((item) => {
    const hit = kind === "fact" ? factVectors.get(item.id) : undefined;
    if (!hit) return true;
    if (hit.textHash !== hashes.get(item.id) || hit.expiresAt <= now) {
      factVectors.delete(item.id);
      return true;
    }
    // Refresh recency, but not expiry: repeated access must not conceal a stored-vector repair.
    factVectors.delete(item.id);
    factVectors.set(item.id, hit);
    out.set(item.id, hit.vector);
    return false;
  });
  const rows = uncached.length ? await sql<{ ref_id: string; text_hash: string; vector: number[] }[]>`
    SELECT ref_id, text_hash, vector FROM embeddings WHERE kind = ${kind} AND model = ${cfg.model} AND ref_id IN ${sql(uncached.map((i) => i.id))}` : [];
  const have = new Map(rows.map((r) => [r.ref_id, r]));
  const missing = uncached.filter((i) => {
    const h = have.get(i.id);
    if (h && h.text_hash === hashes.get(i.id)) {
      out.set(i.id, h.vector);
      if (kind === "fact") cacheFact(i.id, h.text_hash, h.vector);
      return false;
    }
    return true;
  });
  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    const vectors = await embedBatch(batch.map((b) => b.text.slice(0, 2000)), `${kind}:${batch[0]!.id}`);
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j]!;
      const v = vectors[j]!;
      out.set(item.id, v);
      await sql`INSERT INTO embeddings (kind, ref_id, model, text_hash, vector) VALUES (${kind}, ${item.id}, ${cfg.model}, ${hashes.get(item.id)!}, ${v})
                ON CONFLICT (kind, ref_id, model) DO UPDATE SET text_hash = EXCLUDED.text_hash, vector = EXCLUDED.vector, created_at = now()`;
      // Cache only vectors read back from PostgreSQL. Its real[] text representation can round
      // provider doubles; reusing the provider response here would change later cosine results.
    }
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
