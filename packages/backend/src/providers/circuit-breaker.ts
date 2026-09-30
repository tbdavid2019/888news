// Circuit breaker and concurrency limiter for LLM providers.
// Prevents the Thundering Herd Problem when a primary model experiences rate limits (HTTP 429) or outages.

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Consecutive failures before tripping (default: 3)
  cooldownMs?: number; // Time in OPEN state before trying Canary (default: 60,000ms)
  fallbackMaxConcurrency?: number; // Max in-flight requests on fallback tier (default: 3)
}

export interface ProviderCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  openedAt: number;
  cooldownMs: number;
  inFlightCanary: boolean;
  activeCount: number;
}

const circuits = new Map<string, ProviderCircuit>();

function getCircuit(key: string, opts?: CircuitBreakerOptions): ProviderCircuit {
  let c = circuits.get(key);
  if (!c) {
    c = {
      state: "CLOSED",
      failureCount: 0,
      lastFailureTime: 0,
      openedAt: 0,
      cooldownMs: opts?.cooldownMs ?? 60_000,
      inFlightCanary: false,
      activeCount: 0,
    };
    circuits.set(key, c);
  }
  return c;
}

export function getCircuitState(key: string): CircuitState {
  const c = getCircuit(key);
  if (c.state === "OPEN" && Date.now() - c.openedAt >= c.cooldownMs) {
    c.state = "HALF_OPEN";
  }
  return c.state;
}

export interface CanExecuteResult {
  allow: boolean;
  isCanary: boolean;
  state: CircuitState;
  reason?: string;
}

/**
 * Checks if a request can be executed against this provider.
 * Implements Canary Probing: In HALF_OPEN state, only 1 single canary request is admitted.
 */
export function canExecute(key: string, opts?: CircuitBreakerOptions): CanExecuteResult {
  const c = getCircuit(key, opts);
  const now = Date.now();

  if (c.state === "OPEN") {
    if (now - c.openedAt >= c.cooldownMs) {
      c.state = "HALF_OPEN";
    } else {
      return { allow: false, isCanary: false, state: "OPEN", reason: `Circuit is OPEN (cooldown remaining: ${Math.ceil((c.openedAt + c.cooldownMs - now) / 1000)}s)` };
    }
  }

  if (c.state === "HALF_OPEN") {
    // Only 1 canary request is allowed
    if (!c.inFlightCanary) {
      c.inFlightCanary = true;
      return { allow: true, isCanary: true, state: "HALF_OPEN" };
    }
    return { allow: false, isCanary: false, state: "HALF_OPEN", reason: "Canary probe already in flight" };
  }

  // CLOSED state
  return { allow: true, isCanary: false, state: "CLOSED" };
}

/**
 * Records a successful response. If the circuit was in HALF_OPEN, closes it.
 */
export function recordSuccess(key: string): void {
  const c = getCircuit(key);
  c.failureCount = 0;
  c.inFlightCanary = false;
  c.state = "CLOSED";
}

/**
 * Records a failure. If status is 429 or failures exceed threshold, trips the circuit to OPEN.
 */
export function recordFailure(key: string, error: unknown, status?: number | null, opts?: CircuitBreakerOptions): void {
  const c = getCircuit(key, opts);
  if (opts?.cooldownMs) {
    c.cooldownMs = opts.cooldownMs;
  }
  const threshold = opts?.failureThreshold ?? 3;
  c.lastFailureTime = Date.now();
  c.inFlightCanary = false;
  c.failureCount += 1;

  // Immediate trip on HTTP 429 (Rate Limit) or consecutive failures >= threshold
  if (status === 429 || c.failureCount >= threshold || c.state === "HALF_OPEN") {
    c.state = "OPEN";
    c.openedAt = Date.now();
    // Support dynamic Retry-After cooldown if provided in header or error
    if (status === 429 && typeof error === "object" && error !== null && "retryAfterSeconds" in error) {
      const sec = Number((error as { retryAfterSeconds?: number }).retryAfterSeconds);
      if (Number.isFinite(sec) && sec > 0) c.cooldownMs = sec * 1000;
    }
  }
}

/**
 * Resets circuit state (used primarily in tests).
 */
export function resetCircuit(key?: string): void {
  if (key) circuits.delete(key);
  else circuits.clear();
}

/**
 * Asynchronous Semaphore to limit in-flight concurrency on fallback providers.
 */
export async function withConcurrencyLimit<T>(
  key: string,
  maxConcurrency: number,
  fn: () => Promise<T>,
): Promise<T> {
  const c = getCircuit(key);
  if (c.activeCount >= maxConcurrency) {
    // Wait until an active slot frees up
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (c.activeCount < maxConcurrency) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  c.activeCount += 1;
  try {
    return await fn();
  } finally {
    c.activeCount = Math.max(0, c.activeCount - 1);
  }
}

/**
 * Returns jittered delay in milliseconds to decorrelate concurrent retries:
 * delay = random(0, min(maxBackoff, baseBackoff * 2^attempt))
 */
export function computeJitterDelay(attempt: number, baseBackoffMs = 500, maxBackoffMs = 3000): number {
  const exp = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exp);
}
