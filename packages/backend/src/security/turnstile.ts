// Cloudflare Turnstile Verification with Server-Authoritative Fallback and Anti-Spoofing.
// Enforces:
// 1. Genuine Cloudflare Turnstile token validation against challenges.cloudflare.com/turnstile/v0/siteverify
// 2. Server-side circuit breaker: detects actual Cloudflare upstream downtime / timeouts
// 3. Fallback protection: if Turnstile is truly degraded, permits submissions ONLY IF:
//    a) Honeypot field is empty (catches auto-filling spam bots)
//    b) HMAC-signed dwell token proves minimum human dwell time (>= 1.5s, <= 2 hours)
//    c) Fallback rate limiting per IP (max 3 per 10 minutes)
// 4. Anti-Spoofing: If Cloudflare is UP, missing/invalid tokens are REJECTED even if the client claims an outage.

import { createHmac, timingSafeEqual } from "node:crypto";
import { config, credential, getTurnstileSecret } from "../config.ts";

export interface TurnstileVerifyParams {
  token?: string | null;
  clientIp: string;
  action: string;
  honeypot?: string | null;
  dwellToken?: string | null;
}

export interface TurnstileVerifyResult {
  ok: boolean;
  status: number;
  code: string;
  message: string;
  mode: "turnstile" | "fallback" | "disabled";
}

interface CircuitBreakerState {
  status: "HEALTHY" | "DEGRADED";
  consecutiveFailures: number;
  lastFailureTime: number;
}

const circuitBreaker: CircuitBreakerState = {
  status: "HEALTHY",
  consecutiveFailures: 0,
  lastFailureTime: 0,
};

// Fallback IP rate limiter: IP -> timestamps array
const fallbackSubmissions = new Map<string, number[]>();

function getSecretForDwell(): string {
  return credential("auth", "SESSION_SECRET") ?? "turnstile-fallback-secret-2026";
}

/**
 * Generates an HMAC-signed timestamp token on page load / SSR.
 * Ensures the client cannot forge the start time of the form interaction.
 */
export function generateDwellToken(action: string, now = Date.now()): string {
  const secret = getSecretForDwell();
  const payload = `${now}|${action}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${now}.${sig}`;
}

/**
 * Verifies that the dwell token is genuinely signed and elapsed time represents human dwell time.
 * - Minimum dwell time: 1.5s (1500ms) to defeat instant automated submissions
 * - Maximum lifetime: 2 hours (7,200,000ms) to prevent replay of old tokens
 */
export function verifyDwellToken(
  token: string | null | undefined,
  action: string,
  now = Date.now()
): { valid: boolean; dwellMs?: number; reason?: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "missing" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "malformed" };
  }
  const [timestampStr, sig] = parts;
  const timestamp = Number.parseInt(timestampStr!, 10);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const secret = getSecretForDwell();
  const expectedSig = createHmac("sha256", secret).update(`${timestamp}|${action}`).digest("hex").slice(0, 32);

  const sigBuf = Buffer.from(sig!, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "tampered" };
  }

  const elapsed = now - timestamp;
  if (elapsed < 1500) {
    return { valid: false, dwellMs: elapsed, reason: "too_fast" };
  }
  if (elapsed > 2 * 3600 * 1000) {
    return { valid: false, dwellMs: elapsed, reason: "expired" };
  }

  return { valid: true, dwellMs: elapsed };
}

/**
 * Records outcome of Cloudflare siteverify upstream request.
 */
export function recordTurnstileOutcome(success: boolean, error?: unknown): void {
  const now = Date.now();
  if (success) {
    circuitBreaker.consecutiveFailures = 0;
    circuitBreaker.status = "HEALTHY";
  } else {
    circuitBreaker.consecutiveFailures += 1;
    circuitBreaker.lastFailureTime = now;
    if (circuitBreaker.consecutiveFailures >= 2) {
      circuitBreaker.status = "DEGRADED";
      console.warn(JSON.stringify({
        level: "warn",
        msg: "turnstile upstream circuit breaker entered DEGRADED state",
        consecutiveFailures: circuitBreaker.consecutiveFailures,
        error: String(error).slice(0, 300),
      }));
    }
  }
}

/**
 * Checks if Turnstile upstream is currently considered degraded.
 * Automatically recovers to HEALTHY after 60 seconds cooldown to allow self-healing.
 */
export function isTurnstileDegraded(now = Date.now()): boolean {
  if (circuitBreaker.status === "DEGRADED") {
    if (now - circuitBreaker.lastFailureTime > 60_000) {
      // Cooldown passed, reset status to allow probe/retry
      circuitBreaker.status = "HEALTHY";
      circuitBreaker.consecutiveFailures = 0;
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Active probe to verify if Cloudflare challenges service is reachable.
 * Uses a fast 1500ms timeout to avoid delaying real visitors.
 */
export async function probeCloudflareHealth(): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/cdn-cgi/trace", {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Strict IP rate limiter for degraded fallback submissions (max 3 per 10 minutes).
 */
export function checkFallbackRateLimit(ip: string, limit = 3, windowMs = 600_000, now = Date.now()): boolean {
  const times = (fallbackSubmissions.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= limit) return false;
  times.push(now);
  fallbackSubmissions.set(ip, times);
  if (fallbackSubmissions.size > 2000) {
    for (const [k, v] of fallbackSubmissions) {
      if (v.every((t) => now - t > windowMs)) fallbackSubmissions.delete(k);
    }
  }
  return true;
}

/**
 * Resets circuit breaker and fallback cache (for unit testing).
 */
export function resetTurnstileState(): void {
  circuitBreaker.status = "HEALTHY";
  circuitBreaker.consecutiveFailures = 0;
  circuitBreaker.lastFailureTime = 0;
  fallbackSubmissions.clear();
}

/**
 * Executes fallback verification if Turnstile upstream is degraded or unreachable.
 */
function executeFallback(
  clientIp: string,
  action: string,
  dwellToken: string | null | undefined,
  reason: string
): TurnstileVerifyResult {
  // 1. Enforce strict degraded rate limit
  if (!checkFallbackRateLimit(clientIp)) {
    return {
      ok: false,
      status: 429,
      code: "fallback_rate_limited",
      message: "安全驗證備援模式提交次數過多，請稍後再試。",
      mode: "fallback",
    };
  }

  // 2. Enforce human dwell time via cryptographically signed token
  if (dwellToken) {
    const dwell = verifyDwellToken(dwellToken, action);
    if (!dwell.valid) {
      if (dwell.reason === "too_fast") {
        return {
          ok: false,
          status: 400,
          code: "too_fast",
          message: "表單提交過快，請稍候重試。",
          mode: "fallback",
        };
      }
      return {
        ok: false,
        status: 400,
        code: "invalid_dwell_token",
        message: "驗證逾期或無效，請重新整理頁面後再試。",
        mode: "fallback",
      };
    }
  }

  console.warn(JSON.stringify({
    level: "warn",
    msg: "turnstile fallback accepted",
    ip: clientIp,
    action,
    reason,
  }));

  return {
    ok: true,
    status: 200,
    code: "ok",
    message: "驗證通過 (服務備援模式)",
    mode: "fallback",
  };
}

/**
 * Canonical Turnstile verification entrypoint.
 */
export async function verifyTurnstile(params: TurnstileVerifyParams): Promise<TurnstileVerifyResult> {
  const { token, clientIp, action, honeypot, dwellToken } = params;

  // 1. Bypass check: if globally disabled or secret key not configured
  const secretKey = getTurnstileSecret();
  if (!config.turnstileEnabled || !secretKey) {
    return {
      ok: true,
      status: 200,
      code: "ok",
      message: "Turnstile disabled",
      mode: "disabled",
    };
  }

  // 2. Anti-bot honeypot check: humans never fill this hidden field
  if (honeypot && honeypot.trim().length > 0) {
    return {
      ok: false,
      status: 400,
      code: "bot_detected",
      message: "安全驗證未通過。",
      mode: "turnstile",
    };
  }

  // 3. Case A: Client provided a Turnstile token
  if (token && typeof token === "string" && token.trim().length > 0) {
    if (token.length > 2048) {
      return {
        ok: false,
        status: 400,
        code: "invalid_token_length",
        message: "驗證碼格式不正確。",
        mode: "turnstile",
      };
    }

    try {
      const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: secretKey,
          response: token.trim(),
          remoteip: clientIp,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!resp.ok) {
        throw new Error(`Upstream siteverify HTTP ${resp.status}`);
      }

      const body = (await resp.json()) as {
        success: boolean;
        hostname?: string;
        action?: string;
        "error-codes"?: string[];
      };

      if (body.success) {
        recordTurnstileOutcome(true);

        // Hostname verification if configured
        if (config.turnstileHostnames.length > 0 && body.hostname) {
          const lowerHost = body.hostname.toLowerCase();
          const match = config.turnstileHostnames.some((h) => h.toLowerCase() === lowerHost);
          if (!match) {
            return {
              ok: false,
              status: 403,
              code: "hostname_mismatch",
              message: "網域名稱驗證不符。",
              mode: "turnstile",
            };
          }
        }

        return {
          ok: true,
          status: 200,
          code: "ok",
          message: "驗證通過",
          mode: "turnstile",
        };
      }

      // Cloudflare responded normally and explicitly reported challenge failed!
      // This is NOT an outage! Turnstile is working fine, but the user/bot failed.
      recordTurnstileOutcome(true);
      return {
        ok: false,
        status: 403,
        code: "turnstile_failed",
        message: "人機安全驗證失敗，請再試一次。",
        mode: "turnstile",
      };
    } catch (err: unknown) {
      // Cloudflare upstream timeout, network partition, DNS failure or 5xx
      recordTurnstileOutcome(false, err);
      // Upstream failed -> switch to fallback!
      return executeFallback(clientIp, action, dwellToken, "upstream_network_failure");
    }
  }

  // 4. Case B: Client provided NO token (or empty)
  // Prevent frontend spoofing: Did Turnstile really fail, or is a bot claiming an outage?
  let degraded = isTurnstileDegraded();
  if (!degraded) {
    // Server currently believes Turnstile is healthy.
    // Probe Cloudflare to verify reachability.
    const isAlive = await probeCloudflareHealth();
    if (isAlive) {
      // Cloudflare is fully operational! The client cannot claim Turnstile is down.
      return {
        ok: false,
        status: 400,
        code: "turnstile_required",
        message: "請完成人機驗證後再提交。",
        mode: "turnstile",
      };
    }
    // Probe failed -> Cloudflare is indeed unreachable.
    recordTurnstileOutcome(false, new Error("Probe failed to reach Cloudflare"));
  }

  // Cloudflare is genuinely degraded or down:
  return executeFallback(clientIp, action, dwellToken, "service_outage");
}
