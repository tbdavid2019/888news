import test from "node:test";
import assert from "node:assert/strict";
import {
  parseJevKeys,
  resetJevKeyPool,
  getKeyPool,
  isJevAvailable,
} from "../packages/backend/src/providers/jev.ts";

test("jev provider: parses keys and fallback keys correctly", () => {
  const origKey = process.env.JEV_API_KEY;
  const origFallback = process.env.JEV_FALLBACK_API_KEYS;
  try {
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
  try {
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
    process.env.JEV_API_KEY = origKey;
    resetJevKeyPool();
  }
});
