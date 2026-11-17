// Google Gemini Decisions API (gemini-decision-1) Provider
// Structured decision engine: evaluates text/multimodal inputs against typed questions
// (noul, choice, score) with calibrated probabilities and zero output tokens.
// Official endpoint: POST https://generativelanguage.googleapis.com/v1beta/decisions
import { credential } from "../config.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";
import { dispatchAlert } from "../notify/dispatch.ts";
import type { JevAnswer, JevChoiceAnswer, JevQuestion, JevResponse, JevScoreAnswer } from "./jev.ts";

export interface GeminiDecisionUsage {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface GeminiDecisionRawAnswer {
  type?: "noul" | "choice" | "score";
  choice?: string;
  score?: number;
  noul?: number;
  probability?: number;
  confidence?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

export interface GeminiDecisionResponsePayload {
  model?: string;
  answers?: Record<string, GeminiDecisionRawAnswer>;
  usage?: GeminiDecisionUsage;
}

interface GeminiDecisionCircuitState {
  failureCount: number;
  circuitOpenUntil: number;
  inFlight: number;
}

const circuitState: GeminiDecisionCircuitState = {
  failureCount: 0,
  circuitOpenUntil: 0,
  inFlight: 0,
};

export function resetGeminiDecisionCircuit(): void {
  circuitState.failureCount = 0;
  circuitState.circuitOpenUntil = 0;
  circuitState.inFlight = 0;
}

export function getGeminiDecisionApiKey(): string | null {
  return (
    credential("models", "GEMINI_DECISION_API_KEY") ??
    process.env.GEMINI_DECISION_API_KEY ??
    credential("models", "GEMINI_API_KEY") ??
    process.env.GEMINI_API_KEY ??
    null
  );
}

export function getGeminiDecisionBaseUrl(): string {
  const custom =
    credential("models", "GEMINI_DECISIONS_BASE_URL") ??
    process.env.GEMINI_DECISIONS_BASE_URL;
  if (custom && custom.trim() !== "") {
    return custom.trim().replace(/\/$/, "");
  }
  return "https://generativelanguage.googleapis.com/v1beta";
}

export function getGeminiDecisionModel(): string {
  return (
    credential("models", "GEMINI_DECISIONS_MODEL") ??
    process.env.GEMINI_DECISIONS_MODEL ??
    "gemini-decision-1"
  );
}

export function isGeminiDecisionAvailable(): boolean {
  if (process.env.GEMINI_DECISIONS_ENABLED === "false") return false;
  const key = getGeminiDecisionApiKey();
  if (!key) return false;
  const now = Date.now();
  if (circuitState.circuitOpenUntil > 0 && now < circuitState.circuitOpenUntil) {
    return false;
  }
  return true;
}

/**
 * Normalizes Gemini Decisions REST response payload into the canonical JevResponse structure.
 */
export function convertGeminiDecisionResponseToJevResponse(
  raw: GeminiDecisionResponsePayload,
  fallbackModel = "gemini-decision-1"
): JevResponse {
  const answers: Record<string, JevAnswer> = {};

  for (const [name, ans] of Object.entries(raw.answers ?? {})) {
    if (!ans || typeof ans !== "object") continue;

    if (ans.type === "choice" || ans.choice !== undefined) {
      const choiceAns: JevChoiceAnswer = {
        type: "choice",
        choice: ans.choice ?? "",
        confidence: ans.confidence ?? 1.0,
        ...(ans.probabilities ? { probabilities: ans.probabilities } : {}),
      };
      answers[name] = choiceAns;
    } else if (ans.type === "score" || ans.score !== undefined) {
      const scoreAns: JevScoreAnswer = {
        type: "score",
        score: ans.score ?? 0,
        confidence: ans.confidence ?? 1.0,
        ...(ans.legend ? { legend: ans.legend } : {}),
        ...(ans.probabilities ? { probabilities: ans.probabilities } : {}),
      };
      answers[name] = scoreAns;
    } else if (ans.type === "noul" || ans.noul !== undefined || ans.probability !== undefined) {
      answers[name] = {
        type: "noul",
        noul: ans.noul ?? ans.probability ?? 0.5,
      };
    }
  }

  const inputTokens = raw.usage?.total_input_tokens ?? raw.usage?.input_tokens ?? 0;
  const outputTokens = raw.usage?.total_output_tokens ?? raw.usage?.output_tokens ?? 0;

  return {
    model: raw.model || fallbackModel,
    answers,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

export function buildGeminiDecisionsPayload(
  state: string,
  questions: Record<string, JevQuestion>,
  model = getGeminiDecisionModel()
) {
  return {
    model,
    input: state,
    questions,
  };
}

/**
 * Executes a Gemini Decisions API request (`POST /v1beta/decisions`) through receipts.
 */
export async function callGeminiDecisions(
  state: string,
  questions: Record<string, JevQuestion>,
  opts: { purpose: string; subject: string; attemptTag?: string }
): Promise<{ response: JevResponse; receiptId: number; reused: boolean }> {
  const apiKey = getGeminiDecisionApiKey();
  if (!apiKey) {
    throw new Error("Gemini Decision API key is not configured");
  }

  const baseUrl = getGeminiDecisionBaseUrl();
  const model = getGeminiDecisionModel();
  const timeoutMs = Number(process.env.GEMINI_DECISIONS_TIMEOUT_MS || 30000);

  circuitState.inFlight++;
  try {
    const receipt = await paidRequest(
      {
        service: "gemini-decisions",
        model,
        purpose: opts.purpose,
        subject: opts.subject,
        identity: { model, state, questions },
        requestSummary: {
          model,
          promptVersion: "gemini-decisions-v1",
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
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(buildGeminiDecisionsPayload(state, questions, model)),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          circuitState.failureCount++;
          if (circuitState.failureCount >= 3) {
            circuitState.circuitOpenUntil = Date.now() + 60_000;
            void dispatchAlert("Gemini Decisions circuit opened", [
              `Failures: ${circuitState.failureCount}`,
              `HTTP ${res.status}: ${errText.slice(0, 150)}`,
              "Action: Falling back to primary/fallback LLM providers for 60s",
            ]).catch(() => {});
          }
          throw new ProviderRejectedError(
            `Gemini Decisions HTTP ${res.status}: ${errText.slice(0, 300)}`,
            res.status,
            res.status === 429 || res.status >= 500
          );
        }

        const data = (await res.json()) as GeminiDecisionResponsePayload;
        circuitState.failureCount = 0;
        circuitState.circuitOpenUntil = 0;

        const normalized = convertGeminiDecisionResponseToJevResponse(data, model);
        const inTokens = normalized.usage?.input_tokens ?? 0;
        const outTokens = normalized.usage?.output_tokens ?? 0;
        const cost = inTokens > 0
          ? { amount: (inTokens / 1e6) * 0.1, currency: "USD", basis: "estimated" as const }
          : null;

        return {
          response: {
            ...normalized,
            _latencyMs: Date.now() - started,
          },
          requestId: res.headers.get("x-request-id") ?? null,
          usage: {
            input_tokens: inTokens,
            output_tokens: outTokens,
          },
          cost,
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
