// Universal Web Reader for dynamic / anti-scraping protected pages.
// Multi-node Reader cluster with load balancing, anti-thundering herd jitter, circuit breaker and automatic failover.
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";

export const DEFAULT_READER_NODES: readonly string[] = [
  "https://2md.aiurl.tw",
  "https://create360.ai",
  "https://2md.glsoft.ai",
];

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_COOLDOWN_MS = 60_000;

export interface ReaderPage {
  title: string | null;
  url: string | null;
  publishedTime: string | null;
  markdown: string;
  raw: string;
}

export interface ReaderOptions {
  purpose?: string;
  subject?: string;
  cacheToleranceSeconds?: number;
  perRead?: boolean;
  skipJitter?: boolean;
  forceJitter?: boolean;
  timeoutMs?: number;
}

export interface ReaderNodeState {
  url: string;
  consecutiveFailures: number;
  lastFailureAt: number;
  cooldownUntil: number;
}

export function parseReaderText(text: string, targetUrl?: string): ReaderPage {
  const normalizedText = text.replace(/\r\n/g, "\n");
  let title: string | null = null;
  let url: string | null = targetUrl ?? null;
  let publishedTime: string | null = null;
  let markdown = normalizedText.trim();

  // Check if response has standard Title/URL/Source header block (from 2md)
  const headerMatch = /^Title:\s*(.+)$/m.exec(normalizedText);
  if (headerMatch) title = headerMatch[1]!.trim();

  const urlMatch = /^(?:URL Source|Source):\s*(.+)$/m.exec(normalizedText);
  if (urlMatch) url = urlMatch[1]!.trim();

  const timeMatch = /^Published Time:\s*(.+)$/m.exec(normalizedText);
  if (timeMatch) publishedTime = timeMatch[1]!.trim();

  if (normalizedText.includes("\nMarkdown Content:\n")) {
    markdown = normalizedText.split("\nMarkdown Content:\n").slice(1).join("\nMarkdown Content:\n").trim();
  }

  // If title was not extracted from headers, attempt to extract from first H1 markdown
  if (!title) {
    const h1Match = /^#\s+(.+)$/m.exec(markdown);
    if (h1Match) title = h1Match[1]!.trim();
  }

  return { title, url, publishedTime, markdown, raw: text };
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/\/+$/, "");
}

let customEndpoints: string[] | null = null;

export function setReaderEndpoints(endpoints: string[] | null): void {
  customEndpoints = endpoints && endpoints.length > 0 ? endpoints.map(normalizeUrl) : null;
}

export function getReaderEndpoints(): string[] {
  if (customEndpoints && customEndpoints.length > 0) {
    return [...customEndpoints];
  }
  const raw =
    credential("collectors", "READER_BASE_URLS") ??
    process.env.READER_BASE_URLS ??
    credential("collectors", "READER_ENDPOINTS") ??
    process.env.READER_ENDPOINTS ??
    credential("collectors", "READER_BASE_URL") ??
    process.env.READER_BASE_URL ??
    credential("collectors", "JINA_BASE_URL") ??
    process.env.JINA_BASE_URL ??
    null;

  if (raw && raw.trim()) {
    const list = raw
      .split(",")
      .map((s) => normalizeUrl(s))
      .filter(Boolean);
    if (list.length > 0) return list;
  }

  return [...DEFAULT_READER_NODES];
}

export function getReaderTimeoutMs(): number {
  const envVal = process.env.READER_TIMEOUT_MS;
  if (envVal) {
    const n = Number(envVal);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function getReaderCooldownMs(): number {
  const envVal = process.env.READER_COOLDOWN_MS;
  if (envVal) {
    const n = Number(envVal);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_COOLDOWN_MS;
}

const nodeStates = new Map<string, ReaderNodeState>();
let roundRobinIndex = 0;

export function getNodeState(url: string): ReaderNodeState {
  const norm = normalizeUrl(url);
  let state = nodeStates.get(norm);
  if (!state) {
    state = {
      url: norm,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      cooldownUntil: 0,
    };
    nodeStates.set(norm, state);
  }
  return state;
}

export function isNodeHealthy(url: string, now = Date.now()): boolean {
  const state = getNodeState(url);
  return state.cooldownUntil <= now;
}

export function markNodeCooldown(url: string, cooldownMs = getReaderCooldownMs(), now = Date.now()): void {
  const state = getNodeState(url);
  state.consecutiveFailures += 1;
  state.lastFailureAt = now;
  state.cooldownUntil = now + cooldownMs;
}

/**
 * Classifies whether an error is a reader-node failure (network/timeout/5xx/429)
 * or a target-site error (e.g. 404 Not Found, 403 Forbidden on the target article).
 * Target errors should NOT trip the circuit breaker on the Reader node!
 */
export function isNodeLevelFailure(error?: unknown, status?: number | null): boolean {
  if (status === 429) return true; // Rate limit from reader node
  if (status !== null && status !== undefined) {
    if (status >= 500) return true; // 500, 502, 503, 504: reader node server/gateway error
    // Client errors: 400, 401, 403, 404, 410, 422: target page or request issue, NOT reader node failure
    if (status >= 400 && status < 500) return false;
  }
  // If no status or network-level error:
  if (error && typeof error === "object") {
    const msg = String((error as any).message || "");
    const code = String((error as any).code || "");
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "CERT_HAS_EXPIRED" ||
      /timeout|abort|econnrefused|enotfound|tls|ssl|socket/i.test(msg)
    ) {
      return true;
    }
  }
  return true;
}

export function recordNodeFailure(url: string, error?: unknown, status?: number | null, now = Date.now()): void {
  // If this error is a target page issue (e.g. 404 not found on target page), do not trip circuit breaker!
  if (!isNodeLevelFailure(error, status)) {
    return;
  }

  const state = getNodeState(url);
  state.consecutiveFailures += 1;
  state.lastFailureAt = now;
  let cooldownMs = getReaderCooldownMs();

  if (error && typeof error === "object" && "retryAfterSeconds" in error) {
    const sec = Number((error as { retryAfterSeconds?: number }).retryAfterSeconds);
    if (Number.isFinite(sec) && sec > 0) {
      cooldownMs = Math.min(sec * 1000, 300_000); // Cap at 5 minutes
    }
  }
  state.cooldownUntil = now + cooldownMs;
}

export function recordNodeSuccess(url: string): void {
  const state = getNodeState(url);
  state.consecutiveFailures = 0;
  state.cooldownUntil = 0;
}

export function resetReaderCluster(): void {
  nodeStates.clear();
  roundRobinIndex = 0;
  customEndpoints = null;
}

export function getReaderClusterStatus(): Array<{
  url: string;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastFailureAt: number;
  cooldownUntil: number;
  cooldownRemainingMs: number;
}> {
  const endpoints = getReaderEndpoints();
  const now = Date.now();
  return endpoints.map((url) => {
    const s = getNodeState(url);
    const isHealthy = s.cooldownUntil <= now;
    return {
      url,
      isHealthy,
      consecutiveFailures: s.consecutiveFailures,
      lastFailureAt: s.lastFailureAt,
      cooldownUntil: s.cooldownUntil,
      cooldownRemainingMs: Math.max(0, s.cooldownUntil - now),
    };
  });
}

export function computeReaderJitterDelay(minMs = 100, maxMs = 400): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export async function applyJitter(
  targetUrl: string,
  opts?: { skipJitter?: boolean; forceJitter?: boolean; minMs?: number; maxMs?: number },
): Promise<number> {
  if (opts?.skipJitter) return 0;
  const isTest = process.env.NODE_ENV === "test";
  const isLocal = targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost");

  if ((isTest || isLocal) && !opts?.forceJitter) {
    return 0;
  }

  const delayMs = computeReaderJitterDelay(opts?.minMs, opts?.maxMs);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return delayMs;
}

/**
 * Returns candidate nodes ordered by round-robin.
 * Strictly filters out nodes that are in active cooldown to prevent traffic leakage.
 */
export function selectCandidateNodes(): string[] {
  const endpoints = getReaderEndpoints();
  if (endpoints.length === 0) return [];

  const startIdx = roundRobinIndex % endpoints.length;
  roundRobinIndex = (roundRobinIndex + 1) % Number.MAX_SAFE_INTEGER;

  const ordered: string[] = [];
  for (let i = 0; i < endpoints.length; i++) {
    ordered.push(endpoints[(startIdx + i) % endpoints.length]!);
  }

  const now = Date.now();
  const healthy = ordered.filter((u) => isNodeHealthy(u, now));

  // Only return healthy nodes; nodes in cooldown are never queried during normal rotation
  return healthy;
}

export function parseRetryAfterHeader(res: { headers: { get(name: string): string | null } }): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const sec = parseInt(h, 10);
  if (!isNaN(sec) && sec > 0) {
    return Math.min(sec, 300); // Cap at 5 minutes
  }
  const dateMs = Date.parse(h);
  if (!isNaN(dateMs)) {
    const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
    if (diffSec > 0) return Math.min(diffSec, 300);
  }
  return undefined;
}

async function executeWithCluster<T>(
  targetUrl: string,
  opts: ReaderOptions | undefined,
  fetchFn: (endpoint: string, timeoutMs: number) => Promise<T>,
): Promise<T> {
  const candidates = selectCandidateNodes();
  if (candidates.length === 0) {
    const endpoints = getReaderEndpoints();
    if (endpoints.length === 0) {
      throw new Error(`[ReaderCluster] No reader endpoints configured for ${targetUrl}`);
    }
    const status = getReaderClusterStatus();
    const remaining = status.map((s) => s.cooldownRemainingMs).filter((ms) => ms > 0);
    const minWaitMs = remaining.length > 0 ? Math.min(...remaining) : 0;
    const waitSec = Math.max(1, Math.ceil(minWaitMs / 1000));
    throw new Error(`[ReaderCluster] All reader nodes are cooling down (next retry in ~${waitSec}s)`);
  }

  const timeoutMs = opts?.timeoutMs ?? getReaderTimeoutMs();
  // Cluster overall deadline: prevents 3 nodes x 45s from stalling workers for 135s.
  const totalDeadline = Date.now() + Math.min(candidates.length * timeoutMs, 90_000);
  const errors: Array<{ node: string; error: string }> = [];

  for (const node of candidates) {
    const remainingTime = totalDeadline - Date.now();
    if (remainingTime < 3000 && errors.length > 0) {
      // Cluster deadline almost exhausted and we've tried at least one node; stop to avoid stalling worker
      break;
    }
    const nodeTimeout = Math.min(timeoutMs, Math.max(5000, remainingTime));

    await applyJitter(targetUrl, opts);
    const endpoint = `${node.replace(/\/+$/, "")}/${targetUrl.replace(/^\/+/, "")}`;
    try {
      const result = await fetchFn(endpoint, nodeTimeout);
      recordNodeSuccess(node);
      return result;
    } catch (err: any) {
      const status = typeof err?.status === "number" ? err.status : null;
      recordNodeFailure(node, err, status);
      errors.push({ node, error: err?.message || String(err) });
    }
  }

  const detail = errors.map((e) => `[${e.node}]: ${e.error}`).join(", ");
  throw new Error(`[ReaderCluster] All reader nodes failed for ${targetUrl}: ${detail}`);
}

export async function readPageAsMarkdown(
  targetUrl: string,
  opts?: ReaderOptions,
): Promise<ReaderPage> {
  return executeWithCluster(targetUrl, opts, async (endpoint, timeoutMs) => {
    const res = await guardedFetch(endpoint, {
      headers: {
        accept: "text/plain",
      },
      timeoutMs,
      maxBytes: 8 * 1024 * 1024,
    });

    if (res.status === 200) {
      const text = res.text();
      if (!text || text.trim().length === 0) {
        const err = new Error(`Empty response from ${endpoint}`);
        (err as any).status = 200;
        throw err;
      }
      return parseReaderText(text, targetUrl);
    }

    const retryAfter = res.status === 429 ? parseRetryAfterHeader(res) : undefined;
    const err = new Error(`HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
    (err as any).status = res.status;
    if (retryAfter !== undefined) {
      (err as any).retryAfterSeconds = retryAfter;
    }
    throw err;
  });
}

export async function readPageAsHtml(
  targetUrl: string,
  opts?: ReaderOptions,
): Promise<string> {
  return executeWithCluster(targetUrl, opts, async (endpoint, timeoutMs) => {
    const res = await guardedFetch(endpoint, {
      headers: {
        "X-Respond-With": "html",
      },
      timeoutMs,
      maxBytes: 8 * 1024 * 1024,
    });

    if (res.status === 200) {
      const text = res.text();
      if (!text || text.trim().length === 0) {
        const err = new Error(`Empty HTML from ${endpoint}`);
        (err as any).status = 200;
        throw err;
      }
      return text;
    }

    const retryAfter = res.status === 429 ? parseRetryAfterHeader(res) : undefined;
    const err = new Error(`HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
    (err as any).status = res.status;
    if (retryAfter !== undefined) {
      (err as any).retryAfterSeconds = retryAfter;
    }
    throw err;
  });
}
