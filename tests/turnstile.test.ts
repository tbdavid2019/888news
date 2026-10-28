import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import {
  generateDwellToken,
  verifyDwellToken,
  verifyTurnstile,
  resetTurnstileState,
  recordTurnstileOutcome,
  isTurnstileDegraded,
  checkFallbackRateLimit,
} from "../packages/backend/src/security/turnstile.ts";
import { config } from "../packages/backend/src/config.ts";

// Set test environment configuration
config.turnstileEnabled = true;
config.turnstileSecretKey = "test-secret-key-12345678";
config.turnstileHostnames = ["news2.david888.com", "david888.com", "localhost", "127.0.0.1"];

beforeEach(() => {
  resetTurnstileState();
});

test("generateDwellToken and verifyDwellToken works with valid elapsed time", () => {
  const now = Date.now();
  const token = generateDwellToken("feedback", now - 2500); // 2.5s ago
  const result = verifyDwellToken(token, "feedback", now);
  assert.equal(result.valid, true);
  assert.equal(result.dwellMs, 2500);
});

test("verifyDwellToken rejects submissions that are too fast (< 1500ms)", () => {
  const now = Date.now();
  const token = generateDwellToken("feedback", now - 500); // 500ms ago
  const result = verifyDwellToken(token, "feedback", now);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "too_fast");
});

test("verifyDwellToken rejects tampered signature", () => {
  const now = Date.now();
  const token = generateDwellToken("feedback", now - 3000);
  const tampered = token.slice(0, -4) + "ffff";
  const result = verifyDwellToken(tampered, "feedback", now);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "tampered");
});

test("verifyDwellToken rejects different action", () => {
  const now = Date.now();
  const token = generateDwellToken("feedback", now - 3000);
  const result = verifyDwellToken(token, "admin_login", now);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "tampered");
});

test("verifyTurnstile blocks honeypot regardless of token", async () => {
  const result = await verifyTurnstile({
    token: "mock-token",
    clientIp: "127.0.0.1",
    action: "feedback",
    honeypot: "spam_bot_data",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "bot_detected");
});

test("verifyTurnstile succeeds with valid Cloudflare token", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    return new Response(JSON.stringify({
      success: true,
      hostname: "news2.david888.com",
      action: "feedback",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await verifyTurnstile({
      token: "valid-token",
      clientIp: "127.0.0.1",
      action: "feedback",
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "turnstile");
    assert.equal(isTurnstileDegraded(), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("verifyTurnstile fails when Cloudflare explicitly rejects token", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    return new Response(JSON.stringify({
      success: false,
      "error-codes": ["invalid-input-response"],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await verifyTurnstile({
      token: "bad-token",
      clientIp: "127.0.0.1",
      action: "feedback",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "turnstile_failed");
    assert.equal(result.status, 403);
    // Upstream is healthy because it responded with status 200
    assert.equal(isTurnstileDegraded(), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("verifyTurnstile fallback activates when Cloudflare siteverify is down/times out", async () => {
  const realFetch = globalThis.fetch;
  // Simulate Cloudflare upstream failure (network exception)
  globalThis.fetch = async () => {
    throw new Error("ETIMEDOUT: challenges.cloudflare.com");
  };

  try {
    const now = Date.now();
    const dwellToken = generateDwellToken("feedback", now - 3000);

    const result = await verifyTurnstile({
      token: "any-token",
      clientIp: "192.0.2.1",
      action: "feedback",
      dwellToken,
    });

    // Fallback mode activated and allowed submission!
    assert.equal(result.ok, true);
    assert.equal(result.mode, "fallback");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("verifyTurnstile prevents frontend from spoofing outage when Cloudflare is healthy", async () => {
  const realFetch = globalThis.fetch;
  // Mock probe endpoint returning 200 OK (Cloudflare is alive)
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/cdn-cgi/trace")) {
      return new Response("fl=123\nh=challenges.cloudflare.com\n", { status: 200 });
    }
    throw new Error("unexpected request");
  };

  try {
    // Client sends NO token and claims Turnstile failed
    const now = Date.now();
    const dwellToken = generateDwellToken("feedback", now - 3000);

    const result = await verifyTurnstile({
      token: "", // No token provided!
      clientIp: "192.0.2.2",
      action: "feedback",
      dwellToken,
    });

    // Because Cloudflare probe succeeded, server knows Turnstile is NOT down!
    // The attempt to bypass Turnstile is REJECTED!
    assert.equal(result.ok, false);
    assert.equal(result.code, "turnstile_required");
    assert.equal(result.status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("verifyTurnstile permits fallback if Cloudflare probe confirms outage", async () => {
  const realFetch = globalThis.fetch;
  // Simulate probe failure (Cloudflare is completely down)
  globalThis.fetch = async () => {
    throw new Error("ECONNREFUSED: challenges.cloudflare.com");
  };

  try {
    const now = Date.now();
    const dwellToken = generateDwellToken("feedback", now - 3000);

    const result = await verifyTurnstile({
      token: "", // No token because Turnstile is down
      clientIp: "192.0.2.3",
      action: "feedback",
      dwellToken,
    });

    // Fallback mode permitted because Cloudflare is confirmed down
    assert.equal(result.ok, true);
    assert.equal(result.mode, "fallback");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fallback rate limiter caps submissions per IP", () => {
  const ip = "198.51.100.1";
  assert.equal(checkFallbackRateLimit(ip, 2, 60_000), true);
  assert.equal(checkFallbackRateLimit(ip, 2, 60_000), true);
  assert.equal(checkFallbackRateLimit(ip, 2, 60_000), false); // 3rd attempt blocked
});
