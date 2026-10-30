import test from "node:test";
import assert from "node:assert/strict";
import {
  convertQuestionsToOpenAIDecisions,
  convertOpenAIDecisionResponseToJevResponse,
  isOpenAIDecisionAvailable,
  getOpenAIDecisionApiKey,
  getOpenAIDecisionBaseUrl,
  getOpenAIDecisionModel,
  resetOpenAIDecisionCircuit,
  type OpenAIDecisionResponsePayload,
} from "../packages/backend/src/providers/openai-decisions.ts";
import { parseDecisionResult, type JevQuestion } from "../packages/backend/src/providers/jev.ts";

test("openai decisions adapter: converts Jev questions to OpenAI format", () => {
  const questions: Record<string, JevQuestion> = {
    relevance: {
      type: "choice",
      instructions: "Classify tech relevance",
      criteria: {
        PASS: "Tech news",
        BLOCK: "Not tech",
      },
    },
    score: {
      type: "score",
      instructions: "Score 0 to 3",
      criteria: ["No value", "Low noise", "Good", "High priority"],
    },
    is_hot: {
      type: "noul",
      instructions: "Is this article trending?",
    },
  };

  const converted = convertQuestionsToOpenAIDecisions(questions);
  assert.equal(converted.length, 3);

  const rel = converted.find((q) => q.name === "relevance");
  assert.ok(rel && rel.type === "choice");
  assert.equal(rel.choices.length, 2);
  assert.deepEqual(rel.choices[0], { value: "PASS", description: "Tech news" });

  const scr = converted.find((q) => q.name === "score");
  assert.ok(scr && scr.type === "score");
  assert.equal(scr.levels.length, 4);
  assert.deepEqual(scr.levels[0], { label: "0", description: "No value" });
  assert.deepEqual(scr.levels[3], { label: "3", description: "High priority" });

  const hot = converted.find((q) => q.name === "is_hot");
  assert.ok(hot && hot.type === "predicate");
  assert.equal(hot.instructions, "Is this article trending?");
});

test("openai decisions adapter: converts OpenAI response to JevResponse", () => {
  const raw: OpenAIDecisionResponsePayload = {
    model: "gpt-6-luna",
    answers: [
      {
        name: "relevance",
        type: "choice",
        choice: "PASS",
        confidence: 0.98,
        probabilities: [
          { value: "PASS", probability: 0.98 },
          { value: "BLOCK", probability: 0.02 },
        ],
      },
      {
        name: "score",
        type: "score",
        score: 2.7,
        confidence: 0.75,
        probabilities: [
          { label: "0", probability: 0.0 },
          { label: "1", probability: 0.05 },
          { label: "2", probability: 0.2 },
          { label: "3", probability: 0.75 },
        ],
      },
      {
        name: "is_hot",
        type: "predicate",
        probability: 0.91,
      },
    ],
    usage: {
      input_tokens: 300,
      output_tokens: 0,
      total_tokens: 300,
    },
  };

  const normalized = convertOpenAIDecisionResponseToJevResponse(raw);
  assert.equal(normalized.model, "gpt-6-luna");
  assert.equal(normalized.usage?.input_tokens, 300);

  const rel = normalized.answers.relevance;
  assert.ok(rel && rel.type === "choice");
  assert.equal(rel.choice, "PASS");
  assert.equal(rel.confidence, 0.98);
  assert.equal(rel.probabilities?.PASS, 0.98);

  const scr = normalized.answers.score;
  assert.ok(scr && scr.type === "score");
  assert.equal(scr.score, 2.7);
  assert.equal(scr.probabilities?.["3"], 0.75);

  const hot = normalized.answers.is_hot;
  assert.ok(hot && hot.type === "noul");
  assert.equal(hot.noul, 0.91);

  // Test integration with parseDecisionResult
  const decision = parseDecisionResult({ response: normalized, receiptId: 99, reused: false }, "openai");
  assert.equal(decision.engine, "openai");
  assert.equal(decision.label, "PASS");
  assert.equal(decision.rawGrade, 2.7);
  assert.equal(decision.score, 90); // 2.7 / 3 * 100 = 90
  assert.equal(decision.model, "gpt-6-luna");
});

test("openai decisions adapter: availability and environment configuration", () => {
  const origKey = process.env.OPENAI_DECISION_API_KEY;
  const origGenKey = process.env.OPENAI_API_KEY;
  const origEnabled = process.env.OPENAI_DECISIONS_ENABLED;
  const origBase = process.env.OPENAI_DECISIONS_BASE_URL;
  const origModel = process.env.OPENAI_DECISIONS_MODEL;

  try {
    delete process.env.OPENAI_DECISION_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_DECISIONS_ENABLED = "true";
    resetOpenAIDecisionCircuit();
    assert.equal(isOpenAIDecisionAvailable(), false);

    process.env.OPENAI_DECISION_API_KEY = "sk-test-decision-key";
    assert.equal(isOpenAIDecisionAvailable(), true);
    assert.equal(getOpenAIDecisionApiKey(), "sk-test-decision-key");
    assert.equal(getOpenAIDecisionBaseUrl(), "https://api.openai.com/v1");
    assert.equal(getOpenAIDecisionModel(), "gpt-6-luna");

    process.env.OPENAI_DECISIONS_ENABLED = "false";
    assert.equal(isOpenAIDecisionAvailable(), false);
  } finally {
    process.env.OPENAI_DECISION_API_KEY = origKey;
    process.env.OPENAI_API_KEY = origGenKey;
    process.env.OPENAI_DECISIONS_ENABLED = origEnabled;
    process.env.OPENAI_DECISIONS_BASE_URL = origBase;
    process.env.OPENAI_DECISIONS_MODEL = origModel;
    resetOpenAIDecisionCircuit();
  }
});
