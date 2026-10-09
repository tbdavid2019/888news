import test from "node:test";
import assert from "node:assert/strict";
import {
  parseJevKeys,
  resetJevKeyPool,
  getKeyPool,
  isJevAvailable,
  isClefAvailable,
  resetClefState,
  isDecisionEngineAvailable,
  getClefTimeoutMs,
  parseDecisionResult,
  normalizeClefEndpoint,
  getClefEndpoints,
} from "../packages/backend/src/providers/jev.ts";

test("jev provider: parses keys and fallback keys correctly", () => {
  const origKey = process.env.JEV_API_KEY;
  const origEnabled = process.env.JEV_ENABLED;
  const origFallback = process.env.JEV_FALLBACK_API_KEYS;
  try {
    process.env.JEV_ENABLED = "true";
    process.env.JEV_API_KEY = "key1, key2";
    process.env.JEV_FALLBACK_API_KEYS = "key3, key2"; // key2 is duplicate
    resetJevKeyPool();

    const keys = parseJevKeys();
    assert.deepEqual(keys, ["key1", "key2", "key3"]);

    const pool = getKeyPool();
    assert.equal(pool.length, 3);
    assert.equal(pool[0]?.key, "key1");
    assert.equal(pool[1]?.key, "key2");
    assert.equal(pool[2]?.key, "key3");
    assert.equal(isJevAvailable(), true);
  } finally {
    process.env.JEV_ENABLED = origEnabled;
    process.env.JEV_API_KEY = origKey;
    process.env.JEV_FALLBACK_API_KEYS = origFallback;
    resetJevKeyPool();
  }
});

test("jev provider: handles empty or disabled state", () => {
  const origKey = process.env.JEV_API_KEY;
  const origEnabled = process.env.JEV_ENABLED;
  try {
    delete process.env.JEV_API_KEY;
    delete process.env.JEV_FALLBACK_API_KEYS;
    resetJevKeyPool();
    assert.equal(isJevAvailable(), false);

    process.env.JEV_API_KEY = "key1";
    process.env.JEV_ENABLED = "false";
    resetJevKeyPool();
    assert.equal(isJevAvailable(), false);
  } finally {
    process.env.JEV_API_KEY = origKey;
    process.env.JEV_ENABLED = origEnabled;
    resetJevKeyPool();
  }
});

test("jev provider: key pool status transitions on failure and cooldown", () => {
  const origKey = process.env.JEV_API_KEY;
  const origEnabled = process.env.JEV_ENABLED;
  try {
    process.env.JEV_ENABLED = "true";
    process.env.JEV_API_KEY = "k1,k2";
    resetJevKeyPool();
    const pool = getKeyPool();
    assert.equal(pool.length, 2);

    // Simulate key1 getting exhausted (HTTP 402)
    pool[0]!.status = "exhausted";
    pool[0]!.cooldownUntil = Date.now() + 60_000;

    // key2 is still active, so isJevAvailable is true
    assert.equal(isJevAvailable(), true);

    // If both are exhausted
    pool[1]!.status = "exhausted";
    pool[1]!.cooldownUntil = Date.now() + 60_000;
    assert.equal(isJevAvailable(), false);

    // Simulate cooldown passing
    pool[0]!.cooldownUntil = Date.now() - 1000;
    assert.equal(isJevAvailable(), true);
  } finally {
    process.env.JEV_ENABLED = origEnabled;
    process.env.JEV_API_KEY = origKey;
    resetJevKeyPool();
  }
});

test("clef provider: availability and circuit breaker checks", () => {
  const origClefEnabled = process.env.CLEF_ENABLED;
  try {
    resetClefState();
    delete process.env.CLEF_ENABLED;
    assert.equal(isClefAvailable(), true);

    process.env.CLEF_ENABLED = "false";
    assert.equal(isClefAvailable(), false);

    process.env.CLEF_ENABLED = "true";
    assert.equal(isClefAvailable(), true);
    assert.equal(isDecisionEngineAvailable(), true);
  } finally {
    process.env.CLEF_ENABLED = origClefEnabled;
    resetClefState();
  }
});

test("clef timeout configuration: defaults to 45000 and respects env", () => {
  const orig = process.env.CLEF_TIMEOUT_MS;
  try {
    delete process.env.CLEF_TIMEOUT_MS;
    assert.equal(getClefTimeoutMs(), 45000);

    process.env.CLEF_TIMEOUT_MS = "60000";
    assert.equal(getClefTimeoutMs(), 60000);
  } finally {
    process.env.CLEF_TIMEOUT_MS = orig;
  }
});

test("clef endpoints: normalizes URLs correctly and supports primary + fallback", () => {
  assert.equal(normalizeClefEndpoint("https://clef.create360.ai/v1/systemone"), "https://clef.create360.ai/v1");
  assert.equal(normalizeClefEndpoint("https://clef.create360.ai/v1/systemone/"), "https://clef.create360.ai/v1");
  assert.equal(normalizeClefEndpoint("https://clef.create360.ai/v1"), "https://clef.create360.ai/v1");
  assert.equal(normalizeClefEndpoint("https://clef.create360.ai"), "https://clef.create360.ai/v1");
  assert.equal(normalizeClefEndpoint("https://clef.aiurl.tw/v1/systemone"), "https://clef.aiurl.tw/v1");

  const origBase = process.env.CLEF_BASE_URL;
  const origFallback = process.env.CLEF_FALLBACK_BASE_URL;
  try {
    delete process.env.CLEF_BASE_URL;
    delete process.env.CLEF_FALLBACK_BASE_URL;

    // Default: primary create360.ai + fallback aiurl.tw
    const defaultEndpoints = getClefEndpoints();
    assert.deepEqual(defaultEndpoints, [
      "https://clef.create360.ai/v1",
      "https://clef.aiurl.tw/v1",
    ]);

    // Custom endpoints
    process.env.CLEF_BASE_URL = "https://custom-clef.example.com/v1/systemone";
    process.env.CLEF_FALLBACK_BASE_URL = "https://backup-clef.example.com";
    assert.deepEqual(getClefEndpoints(), [
      "https://custom-clef.example.com/v1",
      "https://backup-clef.example.com/v1",
    ]);

    // Deduplication when fallback is same as primary
    process.env.CLEF_BASE_URL = "https://same.example.com/v1";
    process.env.CLEF_FALLBACK_BASE_URL = "https://same.example.com/v1/systemone";
    assert.deepEqual(getClefEndpoints(), ["https://same.example.com/v1"]);
  } finally {
    process.env.CLEF_BASE_URL = origBase;
    process.env.CLEF_FALLBACK_BASE_URL = origFallback;
  }
});

test("parseDecisionResult: parses all 5 structured fields (relevance, score, category, itemType, authorRole)", () => {
  const rawClef = {
    response: {
      model: "Cloudflare/clef-flash",
      answers: {
        relevance: { type: "choice" as const, choice: "PASS", confidence: 0.95 },
        score: { type: "score" as const, score: 2.19, confidence: 0.6 },
        category: { type: "choice" as const, choice: "industry", confidence: 0.88 },
        itemType: { type: "choice" as const, choice: "product_launch", confidence: 0.75 },
        authorRole: { type: "choice" as const, choice: "principal", confidence: 0.94 },
      },
    },
    receiptId: 101,
    reused: false,
  };

  const parsed = parseDecisionResult(rawClef, "clef");
  assert.equal(parsed.label, "PASS");
  assert.equal(parsed.score, 73); // Math.round((2.19 / 3.0) * 100) = 73
  assert.equal(parsed.category, "industry");
  assert.equal(parsed.itemType, "product_launch");
  assert.equal(parsed.authorRole, "principal");
  assert.equal(parsed.engine, "clef");
  assert.equal(parsed.model, "Cloudflare/clef-flash");
  assert.equal(parsed.receiptId, 101);
});

test("parseDecisionResult: handles missing optional fields gracefully", () => {
  const partial = {
    response: {
      model: "jev-latest",
      answers: {
        relevance: { type: "choice" as const, choice: "BLOCK", confidence: 0.9 },
        score: { type: "score" as const, score: 0.5, confidence: 0.7 },
      },
    },
    receiptId: 102,
    reused: true,
  };

  const parsed = parseDecisionResult(partial, "jev");
  assert.equal(parsed.label, "BLOCK");
  assert.equal(parsed.score, 17); // Math.round((0.5 / 3.0) * 100) = 17
  assert.equal(parsed.category, null);
  assert.equal(parsed.itemType, null);
  assert.equal(parsed.authorRole, null);
  assert.equal(parsed.engine, "jev");
});

test("event grouping relation criteria: contains 4 expected relation keys", async () => {
  const { RELATION_CRITERIA } = await import("../packages/backend/src/providers/jev.ts");
  assert.ok(RELATION_CRITERIA.SAME_OCCURRENCE);
  assert.ok(RELATION_CRITERIA.SAME_STORY);
  assert.ok(RELATION_CRITERIA.UNRELATED);
  assert.ok(RELATION_CRITERIA.ROUNDUP);
});



