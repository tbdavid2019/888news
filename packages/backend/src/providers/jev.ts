// TypeSafe AI Jev (System One) Provider.
// Dedicated structured decision engine for boolean (noul), choice (categorical), and numeric scoring.
// Offers 200x speed and 400x cost efficiency, operating with zero token consumption on primary LLMs.
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";
import { dispatchAlert } from "../notify/dispatch.ts";

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AllJevKeysExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllJevKeysExhaustedError";
  }
}

export interface KeySlot {
  key: string;
  status: "active" | "rate_limited" | "exhausted";
  cooldownUntil: number;
  failureCount: number;
  lastError?: string;
}

let keySlots: KeySlot[] | null = null;

export function parseJevKeys(): string[] {
  const primary = (credential("models", "JEV_API_KEY") ?? process.env.JEV_API_KEY ?? "").trim();
  const fallbacks = (credential("models", "JEV_FALLBACK_API_KEYS") ?? process.env.JEV_FALLBACK_API_KEYS ?? "").trim();
  const combined = [primary, fallbacks].filter(Boolean).join(",");
  const rawList = combined.split(",").map((k) => k.trim()).filter(Boolean);
  return Array.from(new Set(rawList));
}

export function resetJevKeyPool(): void {
  keySlots = null;
}

export function getKeyPool(): KeySlot[] {
  if (keySlots === null) {
    const keys = parseJevKeys();
    keySlots = keys.map((key) => ({
      key,
      status: "active",
      cooldownUntil: 0,
      failureCount: 0,
    }));
  }
  return keySlots;
}

export function isJevAvailable(): boolean {
  if (process.env.JEV_ENABLED === "false") return false;
  const pool = getKeyPool();
  if (pool.length === 0) return false;
  const now = Date.now();
  return pool.some((slot) => slot.status === "active" || (slot.cooldownUntil > 0 && now >= slot.cooldownUntil));
}

function acquireNextKey(): { slot: KeySlot; index: number } | null {
  const pool = getKeyPool();
  if (pool.length === 0) return null;
  const now = Date.now();

  for (let i = 0; i < pool.length; i++) {
    const slot = pool[i]!;
    if (slot.status === "active") return { slot, index: i };
    if (now >= slot.cooldownUntil) {
      slot.status = "active";
      slot.cooldownUntil = 0;
      return { slot, index: i };
    }
  }

  return null;
}

function markKeyFailed(slot: KeySlot, status: number, errorMsg: string): void {
  slot.failureCount++;
  slot.lastError = errorMsg;
  const now = Date.now();

  if (status === 401 || status === 402) {
    slot.status = "exhausted";
    slot.cooldownUntil = now + 30 * 60 * 1000;
    void dispatchAlert(`Jev key exhausted (${slot.key.slice(0, 12)}...)`, [
      `Status: HTTP ${status}`,
      `Error: ${errorMsg}`,
      `Action: Mark key exhausted, cooling down for 30 minutes`,
    ]).catch(() => {});
  } else if (status === 429) {
    slot.status = "rate_limited";
    slot.cooldownUntil = now + 60 * 1000;
    void dispatchAlert(`Jev key rate limited (${slot.key.slice(0, 12)}...)`, [
      `Status: HTTP 429`,
      `Cooldown: 60s`,
    ]).catch(() => {});
  } else {
    if (slot.failureCount >= 3) {
      slot.status = "rate_limited";
      slot.cooldownUntil = now + 30 * 1000;
    }
  }
}

export async function callJevSystemOne(
  state: string,
  questions: Record<string, JevQuestion>,
  opts: { purpose: string; subject: string; attemptTag?: string }
): Promise<{ response: JevResponse; receiptId: number; reused: boolean }> {
  const baseUrl = (credential("models", "JEV_BASE_URL") ?? process.env.JEV_BASE_URL ?? "https://api.typesafe.ai/v1").replace(/\/$/, "");
  const model = credential("models", "JEV_MODEL") ?? process.env.JEV_MODEL ?? "jev-latest";

  const receipt = await paidRequest(
    {
      service: "jev",
      model,
      purpose: opts.purpose,
      subject: opts.subject,
      identity: { model, state, questions },
      requestSummary: { model, stateSnippet: state.slice(0, 200), questionKeys: Object.keys(questions) },
      attemptTag: opts.attemptTag,
    },
    async () => {
      const pool = getKeyPool();
      if (pool.length === 0) {
        throw new AllJevKeysExhaustedError("No Jev API keys configured");
      }

      let lastError: Error | null = null;
      const triedIndices = new Set<number>();

      while (triedIndices.size < pool.length) {
        const next = acquireNextKey();
        if (!next || triedIndices.has(next.index)) break;
        triedIndices.add(next.index);
        const { slot } = next;

        try {
          const res = await guardedFetch(`${baseUrl}/systemone`, {
            method: "POST",
            route: "direct",
            headers: {
              authorization: `Bearer ${slot.key}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ model, state, questions }),
            timeoutMs: 30_000,
            maxBytes: 2 * 1024 * 1024,
          });

          if (res.status === 200) {
            slot.failureCount = 0;
            const data = JSON.parse(res.text()) as JevResponse;
            const inTokens = data.usage?.input_tokens ?? 0;
            const outTokens = data.usage?.output_tokens ?? 0;
            const totalTokens = inTokens + outTokens;
            const cost = totalTokens > 0
              ? { amount: (totalTokens / 1e6) * 0.05, currency: "USD", basis: "estimated" as const }
              : null;

            return {
              response: data,
              requestId: res.headers.get("x-request-id"),
              usage: { input_tokens: inTokens, output_tokens: outTokens },
              cost,
            };
          }

          const errText = res.text();
          markKeyFailed(slot, res.status, errText);
          lastError = new ProviderRejectedError(`Jev HTTP ${res.status}: ${errText}`, res.status, res.status === 429 || res.status >= 500);
          continue;
        } catch (err) {
          if (err instanceof ProviderRejectedError) throw err;
          markKeyFailed(slot, 0, (err as Error).message);
          lastError = err as Error;
          continue;
        }
      }

      void dispatchAlert("All Jev API keys exhausted", [
        `Configured keys count: ${pool.length}`,
        `Last error: ${lastError?.message}`,
        "Action: Falling back to primary/fallback LLM providers",
      ]).catch(() => {});
      throw new AllJevKeysExhaustedError(`All Jev keys exhausted or failed: ${lastError?.message}`);
    }
  );

  return {
    response: receipt.response as JevResponse,
    receiptId: receipt.receiptId,
    reused: receipt.reused,
  };
}

export async function jevEvaluateMaterial(
  material: { title: string; bodyText?: string | null; excerpt?: string | null },
  opts: { purpose?: string; subject?: string; attemptTag?: string } = {}
): Promise<{
  label: "PASS" | "BLOCK" | "UNKNOWN";
  score: number;
  confidence: number;
  model: string;
  receiptId: number;
  reused: boolean;
}> {
  const body = (material.bodyText ?? material.excerpt ?? "").trim();
  const text = [
    `【標題】\n${material.title.trim()}`,
    `【完整內文】\n${body ? body.slice(0, 3000) : material.title.trim()}`,
  ].join("\n\n");

  const questions: Record<string, JevQuestion> = {
    relevance: {
      type: "choice",
      instructions: "Does this content belong to AI, machine learning, or core tech industry editorial coverage?",
      criteria: {
        PASS: "Direct AI models, research papers, tech products, developer tools, AI companies, hardware, or tech breakthroughs",
        BLOCK: "Spam, hiring/recruitment, generic crypto, sales promotion, off-topic daily gossip, routine site notices",
        UNKNOWN: "Borderline, ambiguous, or lacks enough context to decide",
      },
    },
    score: {
      type: "score",
      instructions: "Rate industry importance and editorial value for an AI news digest",
      criteria: [
        "Low importance, trivial update, niche noise, routine patch, or spam",
        "Routine minor release, standard tutorial, niche company discussion",
        "Notable product release, strong paper, meaningful announcement",
        "Major breakthrough, industry-shifting foundation model, breaking milestone",
      ],
    },
  };

  const res = await callJevSystemOne(text, questions, {
    purpose: opts.purpose ?? "prefilter_article",
    subject: opts.subject ?? "article:material",
    attemptTag: opts.attemptTag,
  });

  const relAns = res.response.answers.relevance as JevChoiceAnswer | undefined;
  const scoreAns = res.response.answers.score as JevScoreAnswer | undefined;

  const rawChoice = relAns?.choice?.toUpperCase() ?? "UNKNOWN";
  const label: "PASS" | "BLOCK" | "UNKNOWN" = rawChoice === "BLOCK" ? "BLOCK" : rawChoice === "PASS" ? "PASS" : "UNKNOWN";

  const rawScore = typeof scoreAns?.score === "number" ? scoreAns.score : 1.5;
  const score = Math.max(0, Math.min(100, Math.round((rawScore / 3.0) * 100)));
  const confidence = relAns?.confidence ?? scoreAns?.confidence ?? 0.8;

  return {
    label,
    score,
    confidence,
    model: res.response.model || "jev-latest",
    receiptId: res.receiptId,
    reused: res.reused,
  };
}
