// OpenAI Decisions API (System One) Provider
// Converts unstructured/semi-structured criteria into typed choices, probabilities, and scores.
// Uses official OpenAI Decisions API: POST /v1/decisions with model `gpt-6-luna`.
import { credential } from "../config.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";
import { dispatchAlert } from "../notify/dispatch.ts";
import type { JevAnswer, JevChoiceAnswer, JevQuestion, JevResponse, JevScoreAnswer } from "./jev.ts";

export interface OpenAIDecisionChoiceOption {
  value: string;
  description: string;
}

export interface OpenAIDecisionScoreLevel {
  label: string;
  description: string;
}

export interface OpenAIDecisionPredicateQuestion {
  name: string;
  type: "predicate";
  instructions: string;
}

export interface OpenAIDecisionChoiceQuestion {
  name: string;
  type: "choice";
  instructions: string;
  choices: OpenAIDecisionChoiceOption[];
}

export interface OpenAIDecisionScoreQuestion {
  name: string;
  type: "score";
  instructions: string;
  levels: OpenAIDecisionScoreLevel[];
}

export type OpenAIDecisionQuestion =
  | OpenAIDecisionPredicateQuestion
  | OpenAIDecisionChoiceQuestion
  | OpenAIDecisionScoreQuestion;

export interface OpenAIDecisionRawAnswer {
  type: "predicate" | "choice" | "score";
  name: string;
  choice?: string;
  score?: number;
  probability?: number;
  confidence?: number;
  probabilities?: Array<{
    value?: string | number;
    label?: string;
    probability: number;
  }>;
}

export interface OpenAIDecisionResponsePayload {
  model: string;
  answers: OpenAIDecisionRawAnswer[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIDecisionCircuitState {
  failureCount: number;
  circuitOpenUntil: number;
  inFlight: number;
}

const circuitState: OpenAIDecisionCircuitState = {
  failureCount: 0,
  circuitOpenUntil: 0,
  inFlight: 0,
};

export function resetOpenAIDecisionCircuit(): void {
  circuitState.failureCount = 0;
  circuitState.circuitOpenUntil = 0;
  circuitState.inFlight = 0;
}

export function getOpenAIDecisionApiKey(): string | null {
  return (
    credential("models", "OPENAI_DECISION_API_KEY") ??
    process.env.OPENAI_DECISION_API_KEY ??
    credential("models", "OPENAI_API_KEY") ??
    process.env.OPENAI_API_KEY ??
    null
  );
}

export function getOpenAIDecisionBaseUrl(): string {
  const custom =
    credential("models", "OPENAI_DECISIONS_BASE_URL") ??
    process.env.OPENAI_DECISIONS_BASE_URL ??
    credential("models", "OPENAI_BASE_URL") ??
    process.env.OPENAI_BASE_URL;
  if (custom && custom.trim() !== "") {
    return custom.trim().replace(/\/$/, "");
  }
  return "https://api.openai.com/v1";
}

export function getOpenAIDecisionModel(): string {
  return (
    credential("models", "OPENAI_DECISIONS_MODEL") ??
    process.env.OPENAI_DECISIONS_MODEL ??
    "gpt-6-luna"
  );
}

export function isOpenAIDecisionAvailable(): boolean {
  if (process.env.OPENAI_DECISIONS_ENABLED === "false") return false;
  const key = getOpenAIDecisionApiKey();
  if (!key) return false;
  const now = Date.now();
  if (circuitState.circuitOpenUntil > 0 && now < circuitState.circuitOpenUntil) {
    return false;
  }
  return true;
}

/**
 * Adapter: Transforms generic JevQuestion dictionary into OpenAI Decisions API format.
 */
export function convertQuestionsToOpenAIDecisions(
  questions: Record<string, JevQuestion>
): OpenAIDecisionQuestion[] {
  const result: OpenAIDecisionQuestion[] = [];

  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      result.push({
        name,
        type: "choice",
        instructions: q.instructions,
        choices: Object.entries(q.criteria).map(([value, description]) => ({
          value,
          description,
        })),
      });
    } else if (q.type === "score") {
      result.push({
        name,
        type: "score",
        instructions: q.instructions,
        levels: q.criteria.map((description, idx) => ({
          label: String(idx),
          description,
        })),
      });
    } else if (q.type === "noul") {
      result.push({
        name,
        type: "predicate",
        instructions: q.instructions,
      });
    }
  }

  return result;
}

/**
 * Adapter: Transforms OpenAI Decisions API response into the canonical JevResponse structure.
 */
export function convertOpenAIDecisionResponseToJevResponse(
  raw: OpenAIDecisionResponsePayload
): JevResponse {
  const answers: Record<string, JevAnswer> = {};

  for (const ans of raw.answers || []) {
    if (!ans.name) continue;

    if (ans.type === "choice") {
      const probs: Record<string, number> = {};
      if (Array.isArray(ans.probabilities)) {
        for (const item of ans.probabilities) {
          if (item.value !== undefined) {
            probs[String(item.value)] = item.probability;
          }
        }
      }
      const choiceAns: JevChoiceAnswer = {
        type: "choice",
        choice: ans.choice ?? "",
        confidence: ans.confidence ?? 1.0,
        probabilities: Object.keys(probs).length > 0 ? probs : undefined,
      };
      answers[ans.name] = choiceAns;
    } else if (ans.type === "score") {
      const probs: Record<string, number> = {};
      if (Array.isArray(ans.probabilities)) {
        for (const item of ans.probabilities) {
          const key = item.label ?? String(item.value ?? "");
          if (key) {
            probs[key] = item.probability;
          }
        }
      }
      const scoreAns: JevScoreAnswer = {
        type: "score",
        score: ans.score ?? 0,
        confidence: ans.confidence ?? 1.0,
        probabilities: Object.keys(probs).length > 0 ? probs : undefined,
      };
      answers[ans.name] = scoreAns;
    } else if (ans.type === "predicate") {
      answers[ans.name] = {
        type: "noul",
        noul: ans.probability ?? 0.5,
      };
    }
  }

  return {
    model: raw.model || "gpt-6-luna",
    answers,
    usage: {
      input_tokens: raw.usage?.input_tokens ?? 0,
      output_tokens: raw.usage?.output_tokens ?? 0,
    },
  };
}

/**
 * Executes an OpenAI Decisions API request through receipts and returns a normalized JevResponse.
 */
export async function callOpenAIDecisions(
  state: string,
  questions: Record<string, JevQuestion>,
  opts: { purpose: string; subject: string; attemptTag?: string }
): Promise<{ response: JevResponse; receiptId: number; reused: boolean }> {
  const apiKey = getOpenAIDecisionApiKey();
  if (!apiKey) {
    throw new Error("OpenAI Decision API key is not configured");
  }

  const baseUrl = getOpenAIDecisionBaseUrl();
  const model = getOpenAIDecisionModel();
  const timeoutMs = Number(process.env.OPENAI_DECISIONS_TIMEOUT_MS || 30000);
  const openAIQuestions = convertQuestionsToOpenAIDecisions(questions);

  circuitState.inFlight++;
  try {
    const receipt = await paidRequest(
      {
        service: "openai-decisions",
        model,
        purpose: opts.purpose,
        subject: opts.subject,
        identity: { model, state, questions },
        requestSummary: {
          model,
          promptVersion: "openai-decisions-v1",
          stateSnippet: state.slice(0, 200),
          questionKeys: Object.keys(questions),
        },
        attemptTag: opts.attemptTag,
      },
      async () => {
        const started = Date.now();
        const url = `${baseUrl}/decisions`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: state,
            questions: openAIQuestions,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          circuitState.failureCount++;
          if (circuitState.failureCount >= 3) {
            circuitState.circuitOpenUntil = Date.now() + 60_000;
            void dispatchAlert("OpenAI Decisions circuit opened", [
              `Failures: ${circuitState.failureCount}`,
              `HTTP ${res.status}: ${errText.slice(0, 150)}`,
              "Action: Routing decision traffic to Jev Tier 2 for 60s",
            ]).catch(() => {});
          }
          throw new ProviderRejectedError(
            `OpenAI Decisions HTTP ${res.status}: ${errText.slice(0, 300)}`,
            res.status,
            res.status === 429 || res.status >= 500
          );
        }

        const data = (await res.json()) as OpenAIDecisionResponsePayload;
        circuitState.failureCount = 0;
        circuitState.circuitOpenUntil = 0;

        const normalized = convertOpenAIDecisionResponseToJevResponse(data);
        return {
          response: {
            ...normalized,
            _latencyMs: Date.now() - started,
          },
          requestId: res.headers.get("x-request-id") ?? null,
          usage: {
            input_tokens: data.usage?.input_tokens ?? 0,
            output_tokens: data.usage?.output_tokens ?? 0,
          },
          cost: null,
        };
      }
    );

    return {
      response: receipt.response as JevResponse,
      receiptId: receipt.receiptId,
      reused: receipt.reused,
    };
  } finally {
    circuitState.inFlight = Math.max(0, circuitState.inFlight - 1);
  }
}
