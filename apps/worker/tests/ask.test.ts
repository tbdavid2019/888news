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
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ask`;
    const forbidden = await fetch(url, { method: "POST", body: "{}" });
    assert.equal(forbidden.status, 403);
    const disabled = await fetch(url, { method: "POST", headers: { "x-worker-secret": "test-internal-secret" }, body: "{}" });
    assert.equal(disabled.status, 503);
    assert.deepEqual(await disabled.json(), { error: "Model calls or BYOK service are disabled" });
  } finally {
    delete process.env.BYOK_ENABLED;
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
