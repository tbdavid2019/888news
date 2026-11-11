import "./setup.ts";
process.env.DEFAULT_ASK_KEY = "test-ask-key";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../apps/api/src/app.ts";
import { closeDb } from "@aihot/backend/db";
import { consumeAskQuota } from "@aihot/backend/publication/ask-quota";
import { config } from "@aihot/backend/config";


const app = await buildApp();

after(async () => {
  await app.close();
  await closeDb();
});

test("GET /api/site/ask-quota returns reader daily quota status", async () => {
  const ip = `test-ip-quota-${Date.now()}`;
  const res = await app.inject({
    method: "GET",
    url: "/api/site/ask-quota",
    headers: { "x-real-ip": ip },
  });

  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.limit, 6);
  assert.equal(data.used, 0);
  assert.equal(data.remaining, 6);
  assert.equal(data.quotaExceeded, false);
  assert.equal(data.hasDefaultKey, true);
});

test("default questions use the configured model and refund quota on upstream rate limits", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = config.defaultAskModel;
  const fingerprint = `routing-test-${Date.now()}`;
  let forwardedModel: string | undefined;
  config.defaultAskModel = "configured-chat-model";
  globalThis.fetch = async (_input, init) => {
    forwardedModel = JSON.parse(String(init?.body)).model;
    return new Response(JSON.stringify({ error: "provider rate limit" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/site/ask-model",
      headers: { "x-device-fingerprint": fingerprint },
      payload: { key: "", model: "client-model", messages: [{ role: "user", content: "hello" }] },
    });
    assert.equal(forwardedModel, "configured-chat-model");
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().quotaExceeded, undefined);
    assert.equal(res.headers["x-ask-quota-remaining"], undefined);
    const quota = await app.inject({ method: "GET", url: "/api/site/ask-quota", headers: { "x-device-fingerprint": fingerprint } });
    assert.equal(quota.json().remaining, 6);
  } finally {
    globalThis.fetch = originalFetch;
    config.defaultAskModel = originalModel;
  }
});

test("POST /api/site/ask-model returns 429 when daily 6-question quota is exhausted", async () => {
  const ip = `test-ip-exhaust-${Date.now()}`;
  const fp = `test-fp-exhaust-${Date.now()}`;

  // Exhaust all 6 free quota units
  for (let i = 0; i < 6; i++) {
    await consumeAskQuota(ip, fp);
  }

  // Next question without BYOK key should be rejected with 429 quotaExceeded
  const res = await app.inject({
    method: "POST",
    url: "/api/site/ask-model",
    headers: {
      "x-real-ip": ip,
      "x-device-fingerprint": fp,
    },
    payload: {
      key: "",
      messages: [{ role: "user", content: "Hello" }],
    },
  });

  assert.equal(res.statusCode, 429);
  const body = res.json();
  assert.equal(body.quotaExceeded, true);
  assert.equal(body.limit, 6);
  assert.equal(body.remaining, 0);
  assert.match(body.error, /今日免費額度（6則）已用完/);
  assert.match(body.error, /BYOK/);
});

test("POST /api/site/ask-quota parses fingerprint from body as well as headers", async () => {
  const ip = `test-ip-fp-${Date.now()}`;
  const fp = `device-fingerprint-${Date.now()}`;
  const res = await app.inject({
    method: "POST",
    url: "/api/site/ask-quota",
    headers: { "x-real-ip": ip },
    payload: { fingerprint: fp },
  });

  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.remaining, 6);
  assert.equal(data.quotaExceeded, false);
});

test("BYOK request bypasses daily quota and is not blocked by 429", async () => {
  const ip = `test-ip-byok-${Date.now()}`;
  const fp = `test-fp-byok-${Date.now()}`;

  // Exhaust all 6 free quota units for this IP
  for (let i = 0; i < 6; i++) {
    await consumeAskQuota(ip, fp);
  }

  // When user provides their own key (BYOK), it should NOT be rejected with 429 Quota Exceeded
  const res = await app.inject({
    method: "POST",
    url: "/api/site/ask-model",
    headers: {
      "x-real-ip": ip,
      "x-device-fingerprint": fp,
    },
    payload: {
      provider: "openai",
      key: "sk-user-custom-key-for-testing",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    },
  });

  // Since mock worker is not running on 3002 in this test, it will return 503 Worker unavailable, NOT 429 quotaExceeded
  assert.notEqual(res.statusCode, 429, "BYOK request must not be blocked by 429 quota");
  assert.equal(res.statusCode, 503);
});
