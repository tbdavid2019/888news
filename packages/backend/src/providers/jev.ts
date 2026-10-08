// TypeSafe AI Jev & Clef (System One) Provider.
// Dedicated structured decision engine for boolean (noul), choice (categorical), and numeric scoring.
// Multi-tier architecture:
//   Tier 0: Clef (Local / self-hosted, 0 tokens, free)
//   Tier 1: Jev (Cloud System One, 350ms, multi-key rotation)
//   Tier 2: Primary LLM (Groq / Gemini / OpenAI fallback)
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
  latency_seconds?: number;
}

export class AllJevKeysExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllJevKeysExhaustedError";
  }
}

// ---------------------------------------------------------------------------
// Tier 0: Clef (Local / Self-hosted Decision Engine)
// ---------------------------------------------------------------------------

interface ClefState {
  failureCount: number;
  circuitOpenUntil: number;
  inFlight: number;
}

const clefState: ClefState = {
  failureCount: 0,
  circuitOpenUntil: 0,
  inFlight: 0,
};

export function isClefAvailable(): boolean {
  if (process.env.CLEF_ENABLED === "false") return false;
  const now = Date.now();
  if (clefState.circuitOpenUntil > 0 && now < clefState.circuitOpenUntil) {
    return false;
  }
  const maxConcurrency = Number(process.env.CLEF_MAX_CONCURRENCY || 3);
  if (clefState.inFlight >= maxConcurrency) {
    return false;
  }
  return true;
}

export function resetClefState(): void {
  clefState.failureCount = 0;
  clefState.circuitOpenUntil = 0;
  clefState.inFlight = 0;
}

export function getClefTimeoutMs(): number {
  return Number(process.env.CLEF_TIMEOUT_MS || 45000);
}

function getQuestionOptionCount(q: JevQuestion): number {
  if (q.type === "choice") {
    return Object.keys(q.criteria).length;
  }
  if (q.type === "score") {
    return q.criteria.length;
  }
  return 2; // noul
}

function chunkQuestionsForClef(
  questions: Record<string, JevQuestion>,
  maxOptionsPerChunk = 10
): Array<Record<string, JevQuestion>> {
  const chunks: Array<Record<string, JevQuestion>> = [];
  let cur: Record<string, JevQuestion> = {};
  let cnt = 0;
  for (const [k, q] of Object.entries(questions)) {
    const opts = getQuestionOptionCount(q);
    if (cnt > 0 && cnt + opts > maxOptionsPerChunk) {
      chunks.push(cur);
      cur = {};
      cnt = 0;
    }
    cur[k] = q;
    cnt += opts;
  }
  if (Object.keys(cur).length > 0) chunks.push(cur);
  return chunks;
}

export async function callClefSystemOne(
  state: string,
  questions: Record<string, JevQuestion>,
  opts: { purpose: string; subject: string; attemptTag?: string }
): Promise<{ response: JevResponse; receiptId: number; reused: boolean }> {
  let baseUrl = (process.env.CLEF_BASE_URL ?? "https://clef.create360.ai/v1").replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }
  const rawModel = process.env.CLEF_MODEL ?? "clef-flash";
  const model = rawModel.includes("clef-flash") ? "clef-flash" : rawModel;
  const timeoutMs = getClefTimeoutMs();

  clefState.inFlight++;
  try {
    const receipt = await paidRequest(
      {
        service: "clef",
        model,
        purpose: opts.purpose,
        subject: opts.subject,
        identity: { model, state, questions },
        requestSummary: { model, stateSnippet: state.slice(0, 200), questionKeys: Object.keys(questions) },
        attemptTag: opts.attemptTag,
      },
      async () => {
        const chunks = chunkQuestionsForClef(questions, 10);
        const mergedAnswers: JevResponse["answers"] = {};
        let totalInTokens = 0;
        let totalOutTokens = 0;
        let lastRequestId: string | null = null;

        for (const chunk of chunks) {
          const res = await guardedFetch(`${baseUrl}/systemone`, {
            method: "POST",
            route: "direct",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ model, state, questions: chunk }),
            timeoutMs,
            maxBytes: 2 * 1024 * 1024,
          });

          if (res.status === 200) {
            clefState.failureCount = 0;
            clefState.circuitOpenUntil = 0;
            const data = JSON.parse(res.text()) as JevResponse;
            Object.assign(mergedAnswers, data.answers);
            totalInTokens += data.usage?.input_tokens ?? 0;
            totalOutTokens += data.usage?.output_tokens ?? 0;
            lastRequestId = res.headers.get("x-request-id");
          } else {
            const errText = res.text();
            throw new ProviderRejectedError(`Clef HTTP ${res.status}: ${errText}`, res.status, res.status >= 500);
          }
        }

        const combinedResponse: JevResponse = {
          model,
          answers: mergedAnswers,
          usage: { input_tokens: totalInTokens, output_tokens: totalOutTokens },
        };

        return {
          response: combinedResponse,
          requestId: lastRequestId,
          usage: { input_tokens: totalInTokens, output_tokens: totalOutTokens },
          cost: { amount: 0, currency: "USD", basis: "actual" as const },
        };
      }
    );

    return {
      response: receipt.response as JevResponse,
      receiptId: receipt.receiptId,
      reused: receipt.reused,
    };
  } catch (err) {
    clefState.failureCount++;
    if (clefState.failureCount >= 2) {
      clefState.circuitOpenUntil = Date.now() + 60_000;
      void dispatchAlert("Clef circuit opened", [
        `Failures: ${clefState.failureCount}`,
        `Reason: ${err instanceof Error ? err.message : String(err)}`,
        "Action: Routing decision traffic to Jev Tier 1 for 60s",
      ]).catch(() => {});
    }
    throw err;
  } finally {
    clefState.inFlight = Math.max(0, clefState.inFlight - 1);
  }
}

// ---------------------------------------------------------------------------
// Tier 1: Jev (Cloud Decision Engine with Multi-Key Rotation)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Unified Decision Engine (Clef Tier 0 -> Jev Tier 1)
// ---------------------------------------------------------------------------

export function isDecisionEngineAvailable(): boolean {
  return isClefAvailable() || isJevAvailable();
}

export const isJevOrClefAvailable = isDecisionEngineAvailable;

export function parseDecisionResult(
  res: { response: JevResponse; receiptId: number; reused: boolean },
  engine: "clef" | "jev"
) {
  const relAns = res.response.answers.relevance as JevChoiceAnswer | undefined;
  const scoreAns = res.response.answers.score as JevScoreAnswer | undefined;
  const catAns = res.response.answers.category as JevChoiceAnswer | undefined;
  const itemTypeAns = res.response.answers.itemType as JevChoiceAnswer | undefined;

  const authorRoleAns = res.response.answers.authorRole as JevChoiceAnswer | undefined;

  const rawChoice = relAns?.choice?.toUpperCase() ?? "UNKNOWN";
  const label: "PASS" | "BLOCK" | "UNKNOWN" = rawChoice === "BLOCK" ? "BLOCK" : rawChoice === "PASS" ? "PASS" : "UNKNOWN";

  const rawScore = typeof scoreAns?.score === "number" ? scoreAns.score : 1.5;
  const score = Math.max(0, Math.min(100, Math.round((rawScore / 3.0) * 100)));
  const confidence = relAns?.confidence ?? scoreAns?.confidence ?? 0.8;

  const category = catAns?.choice ? String(catAns.choice).toLowerCase().trim() : null;
  const itemType = itemTypeAns?.choice ? String(itemTypeAns.choice).toLowerCase().trim() : null;
  const rawAuthorRole = authorRoleAns?.choice ? String(authorRoleAns.choice).toLowerCase().trim() : null;
  const authorRole: "principal" | "observer" | "relayer" | null =
    rawAuthorRole === "principal" || rawAuthorRole === "observer" || rawAuthorRole === "relayer" ? rawAuthorRole : null;

  return {
    label,
    score,
    confidence,
    category,
    itemType,
    authorRole,
    model: res.response.model || (engine === "clef" ? "clef-flash" : "jev-latest"),
    engine,
    receiptId: res.receiptId,
    reused: res.reused,
  };
}

export async function evaluateWithDecisionEngine(
  material: { title: string; bodyText?: string | null; excerpt?: string | null },
  opts: { purpose?: string; subject?: string; attemptTag?: string } = {}
): Promise<{
  label: "PASS" | "BLOCK" | "UNKNOWN";
  score: number;
  confidence: number;
  category: string | null;
  itemType: string | null;
  authorRole: "principal" | "observer" | "relayer" | null;
  model: string;
  engine: "clef" | "jev";
  receiptId: number;
  reused: boolean;
}> {
  const body = (material.bodyText ?? material.excerpt ?? "").trim();
  const text = [
    `【標題】\n${material.title.trim()}`,
    `【內文摘要】\n${body ? body.slice(0, 300) : material.title.trim()}`,
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
    category: {
      type: "choice",
      instructions: "Classify this tech/AI article into the best primary category",
      criteria: {
        "ai-models": "New models, model weights, checkpoints, release evaluations, or architecture updates",
        "ai-products": "AI applications, end-user tools, product launches, developer APIs, or platform features",
        "industry": "Company business, hardware, chips, infra, funding, M&A, leadership changes, regulatory policies",
        "paper": "Academic research papers, preprints, benchmarks, technical datasets",
        "tip": "Hands-on tutorials, coding guides, prompt engineering tips, developer workflows",
        "opinion": "Interviews, editorial perspectives, tech critiques, industry commentary",
      },
    },
    itemType: {
      type: "choice",
      instructions: "Determine the primary editorial format and item type",
      criteria: {
        model_release: "Foundation or fine-tuned model release, weights release, model benchmarks, capabilities update",
        product_launch: "New AI product, tool feature update, platform launch, developer API release",
        tool_or_prompt: "Prompts, developer tools, workflows, practical implementation utilities",
        research_paper: "Academic papers, technical reports, preprint research, datasets, benchmarks",
        industry_event: "Funding, acquisitions, executive changes, lawsuits, partnerships, hardware or regulatory policies",
        opinion_analysis: "Editorial perspective, thought leader opinions, expert critiques, deep market commentary",
        tutorial_explainer: "How-to guide, educational explainer, implementation walkthrough, best practices",
      },
    },
    authorRole: {
      type: "choice",
      instructions: "Determine the primary author or reporting perspective of this material",
      criteria: {
        principal: "First-party, official announcement, creator blog, paper author, or company direct release",
        observer: "Independent third-party analyst, technical evaluation, in-depth reviewer, or commentary",
        relayer: "News summary, translated reproduction, secondary citation, media relay, or brief wire news",
      },
    },
  };

  // 1. Try Tier 0: Clef (Local / Self-hosted, free, 0 token cost)
  if (isClefAvailable()) {
    try {
      const res = await callClefSystemOne(text, questions, {
        purpose: opts.purpose ?? "prefilter_article",
        subject: opts.subject ?? "article:material",
        attemptTag: opts.attemptTag,
      });
      return parseDecisionResult(res, "clef");
    } catch (clefErr) {
      console.warn(
        `[DecisionEngine] Clef Tier 0 failed or timed out (${clefErr instanceof Error ? clefErr.message : String(clefErr)}), falling back to Jev Tier 1`
      );
    }
  }

  // 2. Try Tier 1: Jev (Cloud System One, fast & paid)
  if (isJevAvailable()) {
    try {
      const res = await callJevSystemOne(text, questions, {
        purpose: opts.purpose ?? "prefilter_article",
        subject: opts.subject ?? "article:material",
        attemptTag: opts.attemptTag,
      });
      return parseDecisionResult(res, "jev");
    } catch (jevErr) {
      console.warn(
        `[DecisionEngine] Jev Tier 1 failed or exhausted (${jevErr instanceof Error ? jevErr.message : String(jevErr)}), falling back to LLM Tier 2`
      );
      throw jevErr;
    }
  }

  throw new Error("No decision engine (Clef or Jev) available");
}

export const jevEvaluateMaterial = evaluateWithDecisionEngine;

// ---------------------------------------------------------------------------
// Event Grouping Relations (4-way Decision: SAME_OCCURRENCE / SAME_STORY / UNRELATED / ROUNDUP)
// ---------------------------------------------------------------------------

export const RELATION_CRITERIA: Record<"SAME_OCCURRENCE" | "SAME_STORY" | "UNRELATED" | "ROUNDUP", string> = {
  SAME_OCCURRENCE: "The same real-world happening (identical product launch, exact same announcement, incident, or interview)",
  SAME_STORY: "Direct progress or development of the same story (teaser vs launch, launch vs review/listing, incident vs official response)",
  UNRELATED: "Different happenings or distinct events, even if involving the same company or product line",
  ROUNDUP: "One or both reports is a multi-topic digest, weekly roundup, or listicle",
};

export async function evaluatePairRelationWithDecisionEngine(
  reportAText: string,
  reportBText: string,
  opts: { purpose?: string; subject?: string; attemptTag?: string } = {}
): Promise<{
  relation: "SAME_OCCURRENCE" | "SAME_STORY" | "UNRELATED" | "ROUNDUP";
  confidence: number;
  engine: "clef" | "jev";
  receiptId: number;
  reused: boolean;
}> {
  const state = [reportAText.trim(), reportBText.trim(), "这两篇报道是什么关系？"].join("\n\n");
  const questions: Record<string, JevQuestion> = {
    relation: {
      type: "choice",
      instructions: "Determine the factual relationship between Report A and Report B",
      criteria: RELATION_CRITERIA,
    },
  };

  if (isClefAvailable()) {
    try {
      const res = await callClefSystemOne(state, questions, {
        purpose: opts.purpose ?? "group_pair",
        subject: opts.subject ?? "relation:pair",
        attemptTag: opts.attemptTag,
      });
      const ans = res.response.answers.relation as JevChoiceAnswer | undefined;
      const raw = ans?.choice?.toUpperCase() ?? "UNRELATED";
      const relation = raw === "SAME_OCCURRENCE" || raw === "SAME_STORY" || raw === "ROUNDUP" ? raw : "UNRELATED";
      return {
        relation,
        confidence: ans?.confidence ?? 0.8,
        engine: "clef",
        receiptId: res.receiptId,
        reused: res.reused,
      };
    } catch (err) {
      console.warn(`[DecisionEngine] Clef pair relation failed (${err instanceof Error ? err.message : String(err)}), falling back to Jev Tier 1`);
    }
  }

  if (isJevAvailable()) {
    try {
      const res = await callJevSystemOne(state, questions, {
        purpose: opts.purpose ?? "group_pair",
        subject: opts.subject ?? "relation:pair",
        attemptTag: opts.attemptTag,
      });
      const ans = res.response.answers.relation as JevChoiceAnswer | undefined;
      const raw = ans?.choice?.toUpperCase() ?? "UNRELATED";
      const relation = raw === "SAME_OCCURRENCE" || raw === "SAME_STORY" || raw === "ROUNDUP" ? raw : "UNRELATED";
      return {
        relation,
        confidence: ans?.confidence ?? 0.8,
        engine: "jev",
        receiptId: res.receiptId,
        reused: res.reused,
      };
    } catch (err) {
      console.warn(`[DecisionEngine] Jev pair relation failed (${err instanceof Error ? err.message : String(err)}), falling back to LLM Tier 2`);
      throw err;
    }
  }

  throw new Error("No decision engine available for pair relation");
}

export async function evaluateBatchRelationWithDecisionEngine(
  stateText: string,
  candidateIds: string[],
  opts: { purpose?: string; subject?: string; attemptTag?: string } = {}
): Promise<{
  decisions: Array<{ id: string; relation: "SAME_OCCURRENCE" | "SAME_STORY" | "UNRELATED" | "ROUNDUP"; confidence: number }>;
  engine: "clef" | "jev";
  receiptId: number;
  reused: boolean;
}> {
  const questions: Record<string, JevQuestion> = {};
  for (const id of candidateIds) {
    questions[id] = {
      type: "choice",
      instructions: `Determine the factual relationship between the query report and candidate ${id}`,
      criteria: RELATION_CRITERIA,
    };
  }

  const parseBatch = (res: { response: JevResponse; receiptId: number; reused: boolean }, engine: "clef" | "jev") => {
    const decisions: Array<{ id: string; relation: "SAME_OCCURRENCE" | "SAME_STORY" | "UNRELATED" | "ROUNDUP"; confidence: number }> = [];
    for (const id of candidateIds) {
      const ans = res.response.answers[id] as JevChoiceAnswer | undefined;
      const raw = ans?.choice?.toUpperCase() ?? "UNRELATED";
      const relation = raw === "SAME_OCCURRENCE" || raw === "SAME_STORY" || raw === "ROUNDUP" ? raw : "UNRELATED";
      decisions.push({
        id,
        relation,
        confidence: ans?.confidence ?? 0.8,
      });
    }
    return { decisions, engine, receiptId: res.receiptId, reused: res.reused };
  };

  if (isClefAvailable()) {
    try {
      const res = await callClefSystemOne(stateText, questions, {
        purpose: opts.purpose ?? "group_batch",
        subject: opts.subject ?? "relation:batch",
        attemptTag: opts.attemptTag,
      });
      return parseBatch(res, "clef");
    } catch (err) {
      console.warn(`[DecisionEngine] Clef batch relation failed (${err instanceof Error ? err.message : String(err)}), falling back to Jev Tier 1`);
    }
  }

  if (isJevAvailable()) {
    try {
      const res = await callJevSystemOne(stateText, questions, {
        purpose: opts.purpose ?? "group_batch",
        subject: opts.subject ?? "relation:batch",
        attemptTag: opts.attemptTag,
      });
      return parseBatch(res, "jev");
    } catch (err) {
      console.warn(`[DecisionEngine] Jev batch relation failed (${err instanceof Error ? err.message : String(err)}), falling back to LLM Tier 2`);
      throw err;
    }
  }

  throw new Error("No decision engine available for batch relation");
}
