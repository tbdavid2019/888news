import { test, after } from "node:test";
import assert from "node:assert/strict";
import { normalizeAskModel, currentQuotaDay, getAskQuota, consumeAskQuota } from "@aihot/backend/publication/ask-quota";
import { config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";

after(async () => {
  await closeDb();
});

test("normalizeAskModel converts gpt 6.1 luna aliases to gpt-6-luna", () => {
  assert.equal(normalizeAskModel("gpt 6.1 luna"), "gpt-6-luna");
  assert.equal(normalizeAskModel("gpt-6.1-luna"), "gpt-6-luna");
  assert.equal(normalizeAskModel("codex/gpt-6.1-luna"), "gpt-6-luna");
  assert.equal(normalizeAskModel("GPT 6.1 LUNA"), "gpt-6-luna");
  assert.equal(normalizeAskModel("gpt 6 luna"), "gpt-6-luna");
  assert.equal(normalizeAskModel("gpt-6-luna"), "gpt-6-luna");
  assert.equal(normalizeAskModel("gpt-5.6-luna"), "gpt-6-luna");
  assert.equal(normalizeAskModel(""), "gpt-6-luna");
  assert.equal(normalizeAskModel(null), "gpt-6-luna");
  assert.equal(normalizeAskModel("default"), "gpt-6-luna");

  // Other models remain untouched
  assert.equal(normalizeAskModel("gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(normalizeAskModel("llama-3.3-70b-versatile"), "llama-3.3-70b-versatile");
});

test("currentQuotaDay returns valid YYYY-MM-DD string in Asia/Taipei timezone", () => {
  const day = currentQuotaDay();
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
});

test("consumeAskQuota enforces 6 questions daily limit per IP and fingerprint", async () => {
  const testIp = `test-ip-${Date.now()}`;
  const testFp = `test-fp-${Date.now()}`;

  // Initial status: 6 remaining
  const initial = await getAskQuota(testIp, testFp);
  assert.equal(initial.limit, 6);
  assert.equal(initial.used, 0);
  assert.equal(initial.remaining, 6);
  assert.equal(initial.quotaExceeded, false);

  // Consume 6 times (each question or follow-up counts as 1)
  for (let i = 1; i <= 6; i++) {
    const res = await consumeAskQuota(testIp, testFp);
    assert.equal(res.allowed, true, `Question #${i} should be allowed`);
    assert.equal(res.used, i);
    assert.equal(res.remaining, 6 - i);
  }

  // 7th question must be blocked (quota exceeded)
  const blocked = await consumeAskQuota(testIp, testFp);
  assert.equal(blocked.allowed, false, "7th question must be blocked");
  assert.equal(blocked.remaining, 0);

  // Status check after limit
  const statusAfter = await getAskQuota(testIp, testFp);
  assert.equal(statusAfter.quotaExceeded, true);
  assert.equal(statusAfter.remaining, 0);
  assert.equal(statusAfter.used >= 6, true);
});

test("consumeAskQuota blocks requests if either IP or Fingerprint reaches quota", async () => {
  const testIp = `shared-ip-${Date.now()}`;
  const fpA = `fp-user-a-${Date.now()}`;
  const fpB = `fp-user-b-${Date.now()}`;

  // User A consumes all 6 questions under shared IP
  for (let i = 1; i <= 6; i++) {
    await consumeAskQuota(testIp, fpA);
  }

  // User B sharing the same IP attempts to ask: should be blocked by IP limit
  const blockedByIp = await consumeAskQuota(testIp, fpB);
  assert.equal(blockedByIp.allowed, false);
  assert.equal(blockedByIp.remaining, 0);
});

test("consumeAskQuota handles concurrent requests safely without exceeding limit", async () => {
  const testIp = `concurrent-ip-${Date.now()}`;
  const fp = `concurrent-fp-${Date.now()}`;

  // Fire 10 concurrent requests simultaneously
  const results = await Promise.all(
    Array.from({ length: 10 }).map(() => consumeAskQuota(testIp, fp))
  );

  const allowedCount = results.filter((r) => r.allowed).length;
  const blockedCount = results.filter((r) => !r.allowed).length;

  assert.equal(allowedCount, 6, "Exactly 6 requests should be allowed concurrently");
  assert.equal(blockedCount, 4, "Remaining 4 requests should be blocked");
});

test("consumeAskQuota handles long fingerprints and refunds correctly", async () => {
  const testIp = `refund-ip-${Date.now()}`;
  // 150 characters fingerprint (longer than 120): should be handled safely without SQL overflow
  const longFp = "a".repeat(150);

  const res = await consumeAskQuota(testIp, longFp);
  assert.equal(res.allowed, true);

  const { refundAskQuota } = await import("@aihot/backend/publication/ask-quota");
  await refundAskQuota(testIp, longFp);

  const status = await getAskQuota(testIp, longFp);
  assert.equal(status.used, 0);
  assert.equal(status.remaining, 6);
});
