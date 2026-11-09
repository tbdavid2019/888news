// Daily question quota and rate-limit guard for default AI Companion service.
// Enforces 6 questions/day per IP and/or device fingerprint (follow-ups count as 1).
import { sql } from "../db.ts";
import { config } from "../config.ts";

export interface QuotaStatus {
  limit: number;
  used: number;
  remaining: number;
  quotaExceeded: boolean;
}

export interface ConsumeQuotaResult {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
}

/** Normalized date string in UTC+8 (Taiwan / East Asia) timezone: YYYY-MM-DD */
export function currentQuotaDay(now = new Date()): string {
  // Use Intl with Asia/Taipei timezone for consistent local daily reset at midnight
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Normalizes model names, supporting aliases like "gpt 6.1 luna" or "gpt-6.1-luna"
 * to the operational model endpoint identifier "gpt-6-luna".
 */
export function normalizeAskModel(rawModel?: string | null, fallbackToDefault = true): string {
  if (!rawModel || typeof rawModel !== "string") {
    return fallbackToDefault ? config.defaultAskModel : "";
  }
  const trimmed = rawModel.trim();
  if (!trimmed || trimmed === "default") {
    return fallbackToDefault ? config.defaultAskModel : "";
  }

  // Support user/client alias variations for gpt 6.1 luna / gpt 6 luna
  if (/^(?:codex\/)?gpt[-\s]?(?:6(?:\.1)?|5\.6)[-\s]?luna$/i.test(trimmed)) {
    return "gpt-6-luna";
  }

  return trimmed;
}

// In-memory fallback in case the database is temporarily unreachable or running in mock tests
const memoryUsage = new Map<string, { count: number; day: string }>();

function cleanupMemoryFallback(currentDay: string) {
  if (memoryUsage.size > 2000) {
    for (const [k, v] of memoryUsage.entries()) {
      if (v.day !== currentDay) memoryUsage.delete(k);
    }
  }
}

function buildKeys(ip: string, fingerprint?: string | null): string[] {
  const keys: string[] = [];
  const cleanIp = ip.trim().toLowerCase();
  if (cleanIp) keys.push(`ip:${cleanIp.slice(0, 80)}`);
  if (fingerprint && typeof fingerprint === "string") {
    const cleanFp = fingerprint.trim();
    // Reject fallback strings or invalid length to prevent cross-user collisions
    if (cleanFp.length >= 8 && cleanFp.length <= 120 && cleanFp !== "dfp-fallback") {
      keys.push(`fp:${cleanFp.slice(0, 120)}`);
    }
  }
  return keys.length > 0 ? keys : ["ip:anonymous"];
}

/** Check remaining free daily quota for an IP/fingerprint without consuming it */
export async function getAskQuota(ip: string, fingerprint?: string | null): Promise<QuotaStatus> {
  const limit = config.defaultAskDailyLimit || 6;
  const day = currentQuotaDay();
  const keys = buildKeys(ip, fingerprint);

  let maxUsed = 0;

  try {
    const rows = await sql<{ identifier: string; count: number }[]>`
      SELECT identifier, count FROM ask_daily_usage
      WHERE day_date = ${day} AND identifier IN ${sql(keys)}
    `;

    for (const row of rows) {
      if (row.count > maxUsed) maxUsed = row.count;
    }
  } catch {
    cleanupMemoryFallback(day);
    for (const key of keys) {
      const cached = memoryUsage.get(`${key}:${day}`);
      if (cached && cached.count > maxUsed) maxUsed = cached.count;
    }
  }

  const remaining = Math.max(0, limit - maxUsed);
  return {
    limit,
    used: maxUsed,
    remaining,
    quotaExceeded: remaining <= 0,
  };
}

/**
 * Atomically checks and consumes 1 quota unit for the daily counter.
 * Concurrency-safe: utilizes row-level conflict updates to prevent TOCTOU race conditions.
 */
export async function consumeAskQuota(ip: string, fingerprint?: string | null): Promise<ConsumeQuotaResult> {
  const limit = config.defaultAskDailyLimit || 6;
  const day = currentQuotaDay();
  const keys = buildKeys(ip, fingerprint);

  let maxUpdatedCount = 0;
  let exceeded = false;

  try {
    await sql.begin(async (tx) => {
      // 1. Lock/read current status inside transaction to prevent race conditions
      const currentRows = await tx<{ identifier: string; count: number }[]>`
        SELECT identifier, count FROM ask_daily_usage
        WHERE day_date = ${day} AND identifier IN ${sql(keys)}
        FOR UPDATE
      `;

      let currentMax = 0;
      for (const row of currentRows) {
        if (row.count > currentMax) currentMax = row.count;
      }

      if (currentMax >= limit) {
        exceeded = true;
        maxUpdatedCount = currentMax;
        return;
      }

      // 2. Atomically increment all associated keys
      for (const key of keys) {
        const [row] = await tx<{ count: number }[]>`
          INSERT INTO ask_daily_usage (identifier, day_date, count, last_used_at)
          VALUES (${key}, ${day}, 1, NOW())
          ON CONFLICT (identifier, day_date)
          DO UPDATE SET count = ask_daily_usage.count + 1, last_used_at = NOW()
          RETURNING count
        `;
        if (row && row.count > maxUpdatedCount) {
          maxUpdatedCount = row.count;
        }
      }

      // If somehow concurrent transaction bypassed limit
      if (maxUpdatedCount > limit) {
        exceeded = true;
        for (const key of keys) {
          await tx`
            UPDATE ask_daily_usage
            SET count = GREATEST(0, count - 1)
            WHERE identifier = ${key} AND day_date = ${day}
          `;
        }
      }
    });

    if (exceeded) {
      return {
        allowed: false,
        limit,
        used: Math.max(limit, maxUpdatedCount),
        remaining: 0,
      };
    }

    const remaining = Math.max(0, limit - maxUpdatedCount);
    return {
      allowed: true,
      limit,
      used: maxUpdatedCount,
      remaining,
    };
  } catch {
    // Memory fallback with concurrency safety
    cleanupMemoryFallback(day);
    let memMax = 0;
    for (const key of keys) {
      const cached = memoryUsage.get(`${key}:${day}`);
      if (cached && cached.count > memMax) memMax = cached.count;
    }
    if (memMax >= limit) {
      return { allowed: false, limit, used: memMax, remaining: 0 };
    }

    memMax += 1;
    for (const key of keys) {
      memoryUsage.set(`${key}:${day}`, { count: memMax, day });
    }

    return {
      allowed: true,
      limit,
      used: memMax,
      remaining: Math.max(0, limit - memMax),
    };
  }
}

/** Refund 1 quota unit if the upstream LLM provider failed or timed out */
export async function refundAskQuota(ip: string, fingerprint?: string | null): Promise<void> {
  const day = currentQuotaDay();
  const keys = buildKeys(ip, fingerprint);

  try {
    await sql.begin(async (tx) => {
      for (const key of keys) {
        await tx`
          UPDATE ask_daily_usage
          SET count = GREATEST(0, count - 1)
          WHERE identifier = ${key} AND day_date = ${day}
        `;
      }
    });
  } catch {
    for (const key of keys) {
      const memKey = `${key}:${day}`;
      const cached = memoryUsage.get(memKey);
      if (cached && cached.count > 0) {
        cached.count -= 1;
      }
    }
  }
}
