import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// No model or external service is contacted by this test.
test("BYOK bridge requires internal authentication and honors the byok safety switch", async () => {
  process.env.BYOK_ENABLED = "false";
  process.env.IMG_PROXY_SIGN_SECRET = "test-internal-secret";
  process.env.ASK_WORKER_PORT = "0";
  const { startAskBridge } = await import("../src/ask.ts");
  const server = startAskBridge();
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const askUrl = `http://127.0.0.1:${port}/ask`;
    const modelsUrl = `http://127.0.0.1:${port}/ask-models`;

    // 1. /ask endpoints
    const forbidden = await fetch(askUrl, { method: "POST", body: "{}" });
    assert.equal(forbidden.status, 403);
    const disabled = await fetch(askUrl, { method: "POST", headers: { "x-worker-secret": "test-internal-secret" }, body: "{}" });
    assert.equal(disabled.status, 503);
    assert.deepEqual(await disabled.json(), { error: "Model calls or BYOK service are disabled" });

    // 2. /ask-models endpoints
    const forbiddenModels = await fetch(modelsUrl, { method: "POST", body: "{}" });
    assert.equal(forbiddenModels.status, 403);
    const disabledModels = await fetch(modelsUrl, { method: "POST", headers: { "x-worker-secret": "test-internal-secret" }, body: "{}" });
    assert.equal(disabledModels.status, 503);
    assert.deepEqual(await disabledModels.json(), { error: "Model calls or BYOK service are disabled" });
  } finally {
    delete process.env.BYOK_ENABLED;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("BYOK /ask-models validates providers and custom HTTPS URLs", async () => {
  process.env.IMG_PROXY_SIGN_SECRET = "test-internal-secret";
  process.env.ASK_WORKER_PORT = "0";
  const { startAskBridge } = await import("../src/ask.ts");
  const server = startAskBridge();
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const modelsUrl = `http://127.0.0.1:${port}/ask-models`;

    // Invalid provider
    const badProvider = await fetch(modelsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": "test-internal-secret" },
      body: JSON.stringify({ provider: "invalid-llm", key: "some-key" }),
    });
    assert.equal(badProvider.status, 400);

    // Missing key
    const badKey = await fetch(modelsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": "test-internal-secret" },
      body: JSON.stringify({ provider: "openai", key: "" }),
    });
    assert.equal(badKey.status, 400);

    // Custom provider without https
    const badCustom = await fetch(modelsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": "test-internal-secret" },
      body: JSON.stringify({ provider: "custom", key: "some-key", baseUrl: "http://plain-http.example.com" }),
    });
    assert.equal(badCustom.status, 400);
    assert.deepEqual(await badCustom.json(), { error: "Custom endpoints must use HTTPS" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("worker network defaults match container and local deployments", async () => {
  const { askWorkerHost, askWorkerUrl } = await import("@aihot/backend/lib/ask-network");
  assert.equal(askWorkerHost(false), "127.0.0.1");
  assert.equal(askWorkerHost(true), "0.0.0.0");
  assert.equal(askWorkerUrl(false), "http://127.0.0.1:3002");
  assert.equal(askWorkerUrl(true), "http://worker:3002");
});
