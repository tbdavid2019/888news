import test from "node:test";
import assert from "node:assert/strict";
import {
  canExecute,
  recordSuccess,
  recordFailure,
  resetCircuit,
  getCircuitState,
  withConcurrencyLimit,
  computeJitterDelay,
} from "@aihot/backend/providers/circuit-breaker";

test("circuit breaker transitions: CLOSED -> OPEN -> HALF_OPEN -> CLOSED", () => {
  resetCircuit();
  const key = "test-provider";

  // 1. Initial state is CLOSED
  assert.equal(getCircuitState(key), "CLOSED");
  const init = canExecute(key);
  assert.equal(init.allow, true);
  assert.equal(init.isCanary, false);

  // 2. Non-429 failure increments failureCount
  recordFailure(key, new Error("temporary error"), 500, { failureThreshold: 3, cooldownMs: 100 });
  assert.equal(getCircuitState(key), "CLOSED");

  // 3. Immediate trip on HTTP 429
  recordFailure(key, new Error("Rate limit"), 429, { cooldownMs: 100 });
  assert.equal(getCircuitState(key), "OPEN");

  // 4. In OPEN state, requests are blocked immediately
  const blocked = canExecute(key, { cooldownMs: 100 });
  assert.equal(blocked.allow, false);
  assert.equal(blocked.state, "OPEN");

  // 5. Simulate cooldown expiration (force openedAt in past)
  // Wait > 100ms
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(getCircuitState(key), "HALF_OPEN");

      // 6. First request in HALF_OPEN is the Canary
      const canary = canExecute(key);
      assert.equal(canary.allow, true);
      assert.equal(canary.isCanary, true);

      // 7. Second concurrent request while Canary is in flight must be blocked!
      const secondConcurrent = canExecute(key);
      assert.equal(secondConcurrent.allow, false);
      assert.match(secondConcurrent.reason!, /Canary/);

      // 8. Canary succeeds -> Circuit resets to CLOSED
      recordSuccess(key);
      assert.equal(getCircuitState(key), "CLOSED");
      assert.equal(canExecute(key).allow, true);

      resolve();
    }, 120);
  });
});

test("concurrency limiter restricts in-flight executions", async () => {
  resetCircuit();
  const key = "concurrency-test";
  let active = 0;
  let maxActiveObserved = 0;

  const runTask = () =>
    withConcurrencyLimit(key, 2, async () => {
      active++;
      maxActiveObserved = Math.max(maxActiveObserved, active);
      await new Promise((r) => setTimeout(r, 30));
      active--;
    });

  // Launch 5 tasks concurrently
  await Promise.all([runTask(), runTask(), runTask(), runTask(), runTask()]);

  assert.equal(maxActiveObserved <= 2, true, `Observed concurrency ${maxActiveObserved} exceeded limit 2`);
});

test("computeJitterDelay produces randomized delays within bounds", () => {
  for (let i = 0; i < 20; i++) {
    const delay = computeJitterDelay(1, 500, 2000);
    assert.equal(delay >= 0 && delay <= 2000, true);
  }
});
