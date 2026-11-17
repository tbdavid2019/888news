import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeminiDecisionsPayload,
  convertGeminiDecisionResponseToJevResponse,
  getGeminiDecisionApiKey,
  getGeminiDecisionBaseUrl,
  getGeminiDecisionModel,
  isGeminiDecisionAvailable,
  resetGeminiDecisionCircuit,
  type GeminiDecisionResponsePayload,
} from "../packages/backend/src/providers/gemini-decisions.ts";
import { isDecisionEngineAvailable, parseDecisionResult, resetClefState } from "../packages/backend/src/providers/jev.ts";
import { resetOpenAIDecisionCircuit } from "../packages/backend/src/providers/openai-decisions.ts";

test("gemini decisions adapter: converts Gemini response to canonical JevResponse", () => {
  const raw: GeminiDecisionResponsePayload = {
    model: "gemini-decision-1",
    answers: {
      relevance: {
        type: "choice",
        choice: "PASS",
        confidence: 0.96,
        probabilities: { PASS: 0.96, BLOCK: 0.04 },
      },
      score: {
        type: "score",
        score: 2.4,
        confidence: 0.82,
        probabilities: { "0": 0.01, "1": 0.05, "2": 0.44, "3": 0.5 },
      },
      is_hot: {
        type: "noul",
        noul: 0.89,
        confidence: 0.89,
      },
    },
    usage: {
      total_input_tokens: 420,
      total_output_tokens: 0,
      total_tokens: 420,
    },
  };

  const normalized = convertGeminiDecisionResponseToJevResponse(raw);
  assert.equal(normalized.model, "gemini-decision-1");
  assert.equal(normalized.usage?.input_tokens, 420);
  assert.equal(normalized.usage?.output_tokens, 0);

  const rel = normalized.answers.relevance;
  assert.ok(rel && rel.type === "choice");
  assert.equal(rel.choice, "PASS");
  assert.equal(rel.probabilities?.PASS, 0.96);

  const scr = normalized.answers.score;
  assert.ok(scr && scr.type === "score");
  assert.equal(scr.score, 2.4);

  const hot = normalized.answers.is_hot;
  assert.ok(hot && hot.type === "noul");
  assert.equal(hot.noul, 0.89);

  const decision = parseDecisionResult({ response: normalized, receiptId: 77, reused: false }, "gemini");
  assert.equal(decision.engine, "gemini");
  assert.equal(decision.model, "gemini-decision-1");
  assert.equal(decision.label, "PASS");
  assert.equal(decision.rawGrade, 2.4);
  assert.equal(decision.score, 80);

  const reqPayload = buildGeminiDecisionsPayload("Sample article", {
    relevance: { type: "choice", instructions: "Pass or block?", criteria: { PASS: "Yes", BLOCK: "No" } },
  }, "gemini-decision-1");
  assert.equal(reqPayload.model, "gemini-decision-1");
  assert.equal(reqPayload.input, "Sample article");
  assert.equal(reqPayload.questions.relevance?.type, "choice");
});

test("gemini decisions adapter: availability, env resolution, and Jev exclusion from active cascade", () => {
  const origKey = process.env.GEMINI_DECISION_API_KEY;
  const origGeminiKey = process.env.GEMINI_API_KEY;
  const origEnabled = process.env.GEMINI_DECISIONS_ENABLED;
  const origBase = process.env.GEMINI_DECISIONS_BASE_URL;
  const origModel = process.env.GEMINI_DECISIONS_MODEL;
  const origClef = process.env.CLEF_ENABLED;
  const origOpenAI = process.env.OPENAI_DECISIONS_ENABLED;
  const origJev = process.env.JEV_ENABLED;
  const origJevKey = process.env.JEV_API_KEY;

  try {
    delete process.env.GEMINI_DECISION_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_DECISIONS_ENABLED = "true";
    process.env.CLEF_ENABLED = "false";
    process.env.OPENAI_DECISIONS_ENABLED = "false";
    process.env.JEV_ENABLED = "true";
    process.env.JEV_API_KEY = "stale-jev-key";
    resetClefState();
    resetOpenAIDecisionCircuit();
    resetGeminiDecisionCircuit();

    assert.equal(isGeminiDecisionAvailable(), false);
    assert.equal(isDecisionEngineAvailable(), false, "disabled Clef/OpenAI/Gemini with stale Jev key must not enable decision engine");

    process.env.GEMINI_API_KEY = "AIza-test-key";
    assert.equal(isGeminiDecisionAvailable(), true);
    assert.equal(isDecisionEngineAvailable(), true);
    assert.equal(getGeminiDecisionApiKey(), "AIza-test-key");
    assert.equal(getGeminiDecisionBaseUrl(), "https://generativelanguage.googleapis.com/v1beta");
    assert.equal(getGeminiDecisionModel(), "gemini-decision-1");

    process.env.GEMINI_DECISION_API_KEY = "AIza-override-key";
    assert.equal(getGeminiDecisionApiKey(), "AIza-override-key");

    process.env.GEMINI_DECISIONS_ENABLED = "false";
    assert.equal(isGeminiDecisionAvailable(), false);
  } finally {
    if (origKey === undefined) delete process.env.GEMINI_DECISION_API_KEY;
    else process.env.GEMINI_DECISION_API_KEY = origKey;
    if (origGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origGeminiKey;
    if (origEnabled === undefined) delete process.env.GEMINI_DECISIONS_ENABLED;
    else process.env.GEMINI_DECISIONS_ENABLED = origEnabled;
    if (origBase === undefined) delete process.env.GEMINI_DECISIONS_BASE_URL;
    else process.env.GEMINI_DECISIONS_BASE_URL = origBase;
    if (origModel === undefined) delete process.env.GEMINI_DECISIONS_MODEL;
    else process.env.GEMINI_DECISIONS_MODEL = origModel;
    if (origClef === undefined) delete process.env.CLEF_ENABLED;
    else process.env.CLEF_ENABLED = origClef;
    if (origOpenAI === undefined) delete process.env.OPENAI_DECISIONS_ENABLED;
    else process.env.OPENAI_DECISIONS_ENABLED = origOpenAI;
    if (origJev === undefined) delete process.env.JEV_ENABLED;
    else process.env.JEV_ENABLED = origJev;
    if (origJevKey === undefined) delete process.env.JEV_API_KEY;
    else process.env.JEV_API_KEY = origJevKey;
    resetClefState();
    resetOpenAIDecisionCircuit();
    resetGeminiDecisionCircuit();
  }
});
