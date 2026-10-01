// OpenAI-compatible chat calls, always through receipts. One model is enough: `default` is whatever the
// deployment names in LLM_BASE_URL / LLM_API_KEY / LLM_MODEL, and every capability uses it unless an
// environment variable or the admin's model page picks one of the named presets below.
import type { z } from "zod";
import { config, credential } from "../config.ts";
import { sha256 } from "../lib/ids.ts";
import { completeReceipt, paidRequest, ProviderRejectedError, rejectReceivedResponse } from "./receipts.ts";
import { sql } from "../db.ts";
import { canExecute, computeJitterDelay, recordFailure, recordSuccess, withConcurrencyLimit } from "./circuit-breaker.ts";
import { dispatchAlert } from "../notify/dispatch.ts";

export interface ModelSpec {
  key: string;
  service: string;
  model: string;
  baseUrlEnv: string;
  apiKeyEnv: string;
  /** Extra request fields, e.g. switching reasoning off for short structured tasks. */
  extra?: Record<string, unknown>;
  jsonMode: boolean;
  vision?: boolean;
}

function extraFromEnv(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error("LLM_EXTRA_JSON must be a JSON object, e.g. {\"enable_thinking\": false}");
  }
}

let cachedDbLlmConfig: Record<string, string> | null | undefined = undefined;

export function invalidateLlmConfigCache() {
  cachedDbLlmConfig = undefined;
}

export async function getDbLlmConfig(): Promise<Record<string, string>> {
  if (cachedDbLlmConfig !== undefined && cachedDbLlmConfig !== null) return cachedDbLlmConfig;
  try {
    const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'llm_config'`;
    cachedDbLlmConfig = row?.value ?? {};
  } catch {
    cachedDbLlmConfig = {};
  }
  return cachedDbLlmConfig;
}

export const MODELS: Record<string, ModelSpec> = {
  // Read from the environment or DB settings at call time.
  default: {
    key: "default", service: "llm", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    get model() { return cachedDbLlmConfig?.llmModel ?? process.env.LLM_MODEL ?? "gpt-4o-mini"; },
    get extra() { return extraFromEnv(process.env.LLM_EXTRA_JSON); },
    get jsonMode() { return process.env.LLM_JSON_MODE !== "false"; },
    get vision() { return process.env.LLM_VISION === "true"; },
  },
  // Named presets (the models AIHOT itself runs on); each needs its own key.
  // GLM 5.3 Flash always reasons; the lowest effort keeps short structured tasks fast.
  "glm-5.3-flash": {
    key: "glm-5.3-flash", service: "zhipu", model: "glm-5.3-flash",
    baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled" }, reasoning_effort: "low" }, jsonMode: true,
  },
  // The scorer's parameters for glm-5.3-flash (score calls; temperature 1 is set per call).
  "glm-5.3-flash-selection": {
    key: "glm-5.3-flash-selection", service: "zhipu", model: "glm-5.3-flash",
    baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled", clear_thinking: false }, reasoning_effort: "high", top_p: 0.95 }, jsonMode: true,
  },
  // DeepSeek Flash reasons by default; structured tasks switch it off unless the -think variant is used.
  "deepseek-flash": {
    key: "deepseek-flash", service: "deepseek", model: "deepseek-flash",
    baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "deepseek-flash-think": {
    key: "deepseek-flash-think", service: "deepseek", model: "deepseek-flash",
    baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY", jsonMode: true,
  },
  "qwen3.7-flash": {
    key: "qwen3.7-flash", service: "dashscope", model: "qwen3.7-flash",
    baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "qwen3.8-flash": {
    key: "qwen3.8-flash", service: "dashscope", model: "qwen3.8-flash",
    baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "mimo-v2.6-flash": {
    key: "mimo-v2.6-flash", service: "mimo", model: "mimo-v2.6-flash",
    baseUrlEnv: "XIAOMI_MIMO_BASE_URL", apiKeyEnv: "XIAOMI_MIMO_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "qwen3-vl-flash": {
    key: "qwen3-vl-flash", service: "dashscope", model: "qwen3-vl-flash",
    baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: false, vision: true,
  },
  // --- Global Providers: Groq, Google Gemini, OpenAI ---
  "groq-llama-70b": {
    key: "groq-llama-70b", service: "groq", model: "llama-3.3-70b-versatile",
    baseUrlEnv: "GROQ_BASE_URL", apiKeyEnv: "GROQ_API_KEY", jsonMode: true,
  },
  "groq-deepseek-r1": {
    key: "groq-deepseek-r1", service: "groq", model: "deepseek-r1-distill-llama-70b",
    baseUrlEnv: "GROQ_BASE_URL", apiKeyEnv: "GROQ_API_KEY", jsonMode: true,
  },
  "gemini-2.5-flash": {
    key: "gemini-2.5-flash", service: "gemini", model: "gemini-2.5-flash",
    baseUrlEnv: "GEMINI_BASE_URL", apiKeyEnv: "GEMINI_API_KEY", jsonMode: true,
  },
  "gemini-2.5-pro": {
    key: "gemini-2.5-pro", service: "gemini", model: "gemini-2.5-pro",
    baseUrlEnv: "GEMINI_BASE_URL", apiKeyEnv: "GEMINI_API_KEY", jsonMode: true,
  },
  "openai-gpt-4o-mini": {
    key: "openai-gpt-4o-mini", service: "openai", model: "gpt-4o-mini",
    baseUrlEnv: "OPENAI_BASE_URL", apiKeyEnv: "OPENAI_API_KEY", jsonMode: true,
  },
  "openai-gpt-4o": {
    key: "openai-gpt-4o", service: "openai", model: "gpt-4o",
    baseUrlEnv: "OPENAI_BASE_URL", apiKeyEnv: "OPENAI_API_KEY", jsonMode: true,
  },
  // --- Configurable Multi-Tier Fallbacks ---
  fallback_1: {
    key: "fallback_1", service: "fallback_1", baseUrlEnv: "LLM_FALLBACK_1_BASE_URL", apiKeyEnv: "LLM_FALLBACK_1_API_KEY",
    get model() { return cachedDbLlmConfig?.llmFallback1Model ?? process.env.LLM_FALLBACK_1_MODEL ?? ""; },
    jsonMode: true,
  },
  fallback_2: {
    key: "fallback_2", service: "fallback_2", baseUrlEnv: "LLM_FALLBACK_2_BASE_URL", apiKeyEnv: "LLM_FALLBACK_2_API_KEY",
    get model() { return cachedDbLlmConfig?.llmFallback2Model ?? process.env.LLM_FALLBACK_2_MODEL ?? ""; },
    jsonMode: true,
  },
};

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatJsonOptions<S extends z.ZodType> {
  model: string;
  purpose: string;
  subject: string;
  promptVersion: string;
  system: string;
  user: string | ContentPart[];
  schema: S;
  temperature?: number;
  maxTokens?: number;
  attemptTag?: string;
  timeoutMs?: number;
  /** false: the model answers in its own text format (no JSON mode); `parse` turns it into the schema's input. */
  json?: boolean;
  parse?: (content: string) => unknown;
}

export interface ChatJsonResult<T> {
  data: T;
  receiptId: number;
  reused: boolean;
  model: string;
  usage: Record<string, unknown> | null;
}

export class ModelOutputError extends Error {
  readonly receiptId: number | null;
  constructor(message: string, receiptId: number | null = null) {
    super(message);
    this.receiptId = receiptId;
  }
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1]!;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new ModelOutputError("No JSON object in model output");
  const body = t.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(body));
  }
}

/** Models sometimes emit raw newlines or tabs inside JSON strings (multi-line posts); escape only those. */
export function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch < " ") {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function isConnectFailure(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "ECONNRESET_BEFORE_SEND", "CERT_HAS_EXPIRED"].includes(code ?? "");
}

export function getBaseUrl(spec: ModelSpec): string | null {
  const custom = credential("models", spec.baseUrlEnv) ?? process.env[spec.baseUrlEnv];
  if (custom && custom.trim() !== "") return custom;
  if (spec.service === "groq") return "https://api.groq.com/openai/v1";
  if (spec.service === "gemini") return "https://generativelanguage.googleapis.com/v1beta/openai/";
  if (spec.service === "openai") return "https://api.openai.com/v1";
  return null;
}

export function getApiKey(spec: ModelSpec): string | null {
  return credential("models", spec.apiKeyEnv) ?? process.env[spec.apiKeyEnv] ?? null;
}

export async function isFallbackConfigured(key: "fallback_1" | "fallback_2"): Promise<boolean> {
  const spec = MODELS[key];
  if (!spec) return false;
  const dbConfig = await getDbLlmConfig();
  const apiKey = (key === "fallback_1" ? dbConfig.llmFallback1ApiKey : dbConfig.llmFallback2ApiKey) || getApiKey(spec);
  const model = (key === "fallback_1" ? dbConfig.llmFallback1Model : dbConfig.llmFallback2Model) || spec.model;
  return Boolean(apiKey && model);
}

export async function testModelConnection(
  target: "default" | "fallback_1" | "fallback_2",
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const spec = MODELS[target];
  if (!spec) return { ok: false, error: `未知的模型項目: ${target}` };

  const dbConfig = await getDbLlmConfig();
  let baseUrl = getBaseUrl(spec);
  let apiKey = getApiKey(spec);
  let modelName = spec.model;

  if (target === "default") {
    baseUrl = dbConfig.llmBaseUrl || baseUrl || "https://api.openai.com/v1";
    apiKey = dbConfig.llmApiKey || apiKey;
    modelName = dbConfig.llmModel || modelName || "gpt-4o-mini";
  } else if (target === "fallback_1") {
    baseUrl = dbConfig.llmFallback1BaseUrl || baseUrl;
    apiKey = dbConfig.llmFallback1ApiKey || apiKey;
    modelName = dbConfig.llmFallback1Model || modelName;
  } else if (target === "fallback_2") {
    baseUrl = dbConfig.llmFallback2BaseUrl || baseUrl;
    apiKey = dbConfig.llmFallback2ApiKey || apiKey;
    modelName = dbConfig.llmFallback2Model || modelName;
  }

  if (!apiKey) return { ok: false, error: "API Key 尚未配置" };
  if (!modelName) return { ok: false, error: "模型名稱未填寫" };
  if (!baseUrl) return { ok: false, error: "Base URL 未填寫" };

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: "Reply with pong" }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 150)}` };
    }
    return { ok: true, model: modelName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function executeSingleModel<S extends z.ZodType>(
  spec: ModelSpec,
  opts: ChatJsonOptions<S>,
): Promise<ChatJsonResult<z.infer<S>>> {
  const dbConfig = await getDbLlmConfig();
  let baseUrl = getBaseUrl(spec);
  let apiKey = getApiKey(spec);
  let modelName = spec.model;

  if (spec.key === "default") {
    if (dbConfig.llmBaseUrl) baseUrl = dbConfig.llmBaseUrl;
    if (dbConfig.llmApiKey) apiKey = dbConfig.llmApiKey;
    if (dbConfig.llmModel) modelName = dbConfig.llmModel;
    if (!baseUrl) baseUrl = "https://api.openai.com/v1";
    if (!modelName) modelName = "gpt-4o-mini";
  } else if (spec.key === "fallback_1") {
    if (dbConfig.llmFallback1BaseUrl) baseUrl = dbConfig.llmFallback1BaseUrl;
    if (dbConfig.llmFallback1ApiKey) apiKey = dbConfig.llmFallback1ApiKey;
    if (dbConfig.llmFallback1Model) modelName = dbConfig.llmFallback1Model;
  } else if (spec.key === "fallback_2") {
    if (dbConfig.llmFallback2BaseUrl) baseUrl = dbConfig.llmFallback2BaseUrl;
    if (dbConfig.llmFallback2ApiKey) apiKey = dbConfig.llmFallback2ApiKey;
    if (dbConfig.llmFallback2Model) modelName = dbConfig.llmFallback2Model;
  }

  if (!baseUrl || !apiKey || !modelName) {
    throw new Error(`Model ${spec.key} is not configured (${spec.baseUrlEnv}, ${spec.apiKeyEnv}${spec.key === "default" ? ", LLM_MODEL" : ""})`);
  }

  const temperature = opts.temperature ?? 0.2;
  const maxTokens = Math.max(opts.maxTokens ?? 2048, 2048) + (spec.key.endsWith("-think") ? 4000 : 0);
  const userText = typeof opts.user === "string" ? opts.user : JSON.stringify(opts.user);
  const body: Record<string, unknown> = {
    model: modelName,
    messages: [
      // A prompt given as one user message (the title/summary prompts) has no system message.
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      // Multimodal parts go through as parts; plain objects are sent as JSON text.
      { role: "user", content: typeof opts.user === "string" || Array.isArray(opts.user) ? opts.user : userText },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(spec.jsonMode && opts.json !== false ? { response_format: { type: "json_object" } } : {}),
    ...(spec.extra ?? {}),
  };

  const receipt = await paidRequest(
    {
      service: spec.service,
      model: modelName,
      purpose: opts.purpose,
      subject: opts.subject,
      identity: { model: modelName, promptVersion: opts.promptVersion, system: sha256(opts.system), user: sha256(userText), temperature, maxTokens, extra: spec.extra ?? null },
      requestSummary: { promptVersion: opts.promptVersion, systemHash: sha256(opts.system), userHash: sha256(userText), userChars: userText.length, temperature, maxTokens },
      attemptTag: opts.attemptTag,
    },
    async () => {
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
        });
      } catch (error) {
        if (isConnectFailure(error)) throw new ProviderRejectedError(`connect failed: ${String(error)}`, null, true);
        throw error;
      }
      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderRejectedError(`HTTP ${res.status}: ${text.slice(0, 500)}`, res.status, retryable);
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        json = { unparsable: text.slice(0, 20000) };
      }
      const usage = (json.usage as Record<string, unknown> | undefined) ?? null;
      return {
        response: { ...json, _latencyMs: Date.now() - started },
        requestId: (json.id as string | undefined) ?? res.headers.get("x-request-id"),
        usage,
        cost: null,
      };
    },
  );

  const response = receipt.response as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: Record<string, unknown> };
  const content = response.choices?.[0]?.message?.content ?? "";
  let parsed: z.infer<S>;
  try {
    parsed = opts.schema.parse(opts.parse ? opts.parse(content) : extractJson(content));
  } catch (error) {
    // Unusable output: record it and let a later attempt pay for a fresh answer.
    await rejectReceivedResponse(receipt.receiptId, `unusable output: ${String(error).slice(0, 500)}`);
    throw new ModelOutputError(`Model ${spec.key} returned unusable output for ${opts.subject}: ${String(error).slice(0, 300)}`, receipt.receiptId);
  }
  return { data: parsed, receiptId: receipt.receiptId, reused: receipt.reused, model: spec.key, usage: response.usage ?? null };
}

const lastFallbackAlertAt = new Map<string, number>();

function shouldSendFallbackAlert(modelKey: string, cooldownMs = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const last = lastFallbackAlertAt.get(modelKey) ?? 0;
  if (now - last < cooldownMs) return false;
  lastFallbackAlertAt.set(modelKey, now);
  return true;
}

export async function chatJson<S extends z.ZodType>(opts: ChatJsonOptions<S>): Promise<ChatJsonResult<z.infer<S>>> {
  if (!config.modelCallsEnabled) throw new Error("Model calls are disabled (MODEL_CALLS_ENABLED=false)");

  const primaryKey = opts.model;
  const candidates: string[] = [primaryKey];
  if ((await isFallbackConfigured("fallback_1")) && primaryKey !== "fallback_1") candidates.push("fallback_1");
  if ((await isFallbackConfigured("fallback_2")) && primaryKey !== "fallback_2") candidates.push("fallback_2");

  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidateKey = candidates[i]!;
    const spec = MODELS[candidateKey];
    if (!spec) {
      if (candidateKey === primaryKey) throw new Error(`Unknown model ${primaryKey}`);
      continue;
    }

    // Circuit Breaker check: avoid hammering broken provider or stampeding
    const check = canExecute(candidateKey);
    if (!check.allow && candidates.length > 1 && i < candidates.length - 1) {
      console.warn(`[CircuitBreaker] Skipping ${candidateKey} (${check.reason}), switching to fallback`);
      continue;
    }

    try {
      let result: ChatJsonResult<z.infer<S>>;
      if (i > 0) {
        // Fallback tier: apply concurrency limiter (max 3 concurrent calls) and randomized jitter delay
        const jitterMs = computeJitterDelay(i);
        if (jitterMs > 0) await new Promise((r) => setTimeout(r, jitterMs));
        result = await withConcurrencyLimit(candidateKey, 3, () => executeSingleModel(spec, opts));
      } else {
        result = await executeSingleModel(spec, opts);
      }

      recordSuccess(candidateKey);
      return result;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status ?? null;
      recordFailure(candidateKey, err, status);

      // If there is a next fallback candidate, notify admin and try it
      if (i < candidates.length - 1) {
        const nextCandidate = candidates[i + 1]!;
        console.warn(`[LLM Fallback] Model ${candidateKey} failed: ${err instanceof Error ? err.message : String(err)}. Falling back to ${nextCandidate}`);
        if (shouldSendFallbackAlert(candidateKey)) {
          void dispatchAlert(
            "🚨 LLM 模型調用異常並觸發 Fallback 備援",
            [
              `故障模型：${candidateKey} (${spec.model || "default"})`,
              `錯誤訊息：${err instanceof Error ? err.message : String(err)}`,
              `切換備援至：${nextCandidate}`,
              `調用目的：${opts.purpose} (${opts.subject})`,
            ],
            "now",
          ).catch(() => {});
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function markReceiptsCompleted(ids: number[]): Promise<void> {
  for (const id of ids) await completeReceipt(sql, id);
}
