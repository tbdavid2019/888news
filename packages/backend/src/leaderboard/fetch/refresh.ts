// The four-times-a-day leaderboard refresh: fetch every upstream source (each on its own, retried once —
// a failing source keeps its last snapshot, which the method carries forward), store the snapshots whose
// content changed, fill missing context windows, update the USD/CNY rate used for prices and fill in the
// official prices of models that have none yet (database/seeds), then run the method round, which
// publishes only when the evidence changed.
import { sql } from "../../db.ts";
import { guardedFetch } from "../../lib/http-fetch.ts";
import { runLeaderboardRound, type RoundResult } from "../method/run.ts";
import { syncOpenRouterRankings } from "../openrouter-rankings.ts";
import { importOfficialPrices, syncLeaderboardCatalog } from "../prices.ts";
import { FETCHERS } from "./index.ts";
import { storeSnapshot } from "./store.ts";
import type { FetchResult, Fetcher } from "./types.ts";

export interface SourceState {
  ok: boolean;
  at: string;
  lastOkAt: string | null;
  changed?: boolean;
  rows?: number;
  newModels?: number;
  error?: string;
}

const STATE_KEY = "leaderboard.fetch";

/** A parse that suddenly yields under half the rows of the last snapshot is treated as broken, not as news. */
async function plausible(r: FetchResult): Promise<string | null> {
  if (!r.rows.length) return "no rows parsed";
  const [prev] = await sql<{ n: number | null }[]>`
    SELECT (metadata->>'rawRowCount')::int AS n FROM lb_snapshots WHERE source_key = ${r.sourceKey} ORDER BY fetched_at DESC LIMIT 1`;
  if (prev?.n && r.rows.length < prev.n / 2) return `only ${r.rows.length} rows (last snapshot had ${prev.n})`;
  return null;
}

/** One more try after a pause: a single upstream hiccup (a stray 401 or timeout) should not leave a source six hours stale. */
async function fetchWithRetry(f: Fetcher, delayMs: number): Promise<FetchResult[]> {
  try {
    return await f.fetch();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return f.fetch();
  }
}

export async function fetchSources(opts: { retryDelayMs?: number } = {}): Promise<Record<string, SourceState>> {
  const [saved] = await sql<{ value: { sources?: Record<string, SourceState> } }[]>`SELECT value FROM settings WHERE key = ${STATE_KEY}`;
  const states: Record<string, SourceState> = { ...(saved?.value.sources ?? {}) };
  const fail = (key: string, error: string) => {
    states[key] = { ok: false, at: new Date().toISOString(), lastOkAt: states[key]?.lastOkAt ?? null, error: error.slice(0, 300) };
  };
  // Overlap two independent upstream waits. Store in registry order: model identity resolution can
  // depend on a previous source's aliases, so concurrent fetching must not reorder snapshot writes.
  for (let start = 0; start < FETCHERS.length; start += 2) {
    const batch = FETCHERS.slice(start, start + 2);
    const fetched = await Promise.allSettled(batch.map((f) => fetchWithRetry(f, opts.retryDelayMs ?? 15_000)));
    for (const [i, outcome] of fetched.entries()) {
      const f = batch[i]!;
      if (outcome.status === "rejected") {
        for (const k of f.sourceKeys) fail(k, (outcome.reason as Error).message);
        continue;
      }
      const results = outcome.value;
      for (const k of f.sourceKeys) if (!results.some((r) => r.sourceKey === k)) fail(k, "source missing from the fetch result");
      for (const r of results) {
        try {
          const problem = await plausible(r);
          if (problem) throw new Error(problem);
          const s = await storeSnapshot(r);
          const at = new Date().toISOString();
          states[r.sourceKey] = { ok: true, at, lastOkAt: at, changed: s.changed, rows: s.rows, newModels: s.newModels };
        } catch (e) {
          fail(r.sourceKey, (e as Error).message);
        }
      }
    }
  }
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${STATE_KEY}, ${sql.json({ at: new Date().toISOString(), sources: states } as never)}, 'worker')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return states;
}

/** European Central Bank reference rate via Frankfurter (the rate and date the price column cites). */
export async function refreshFx(): Promise<{ asOf: string; rate: number }> {
  const url = "https://api.frankfurter.app/latest?from=USD&to=CNY";
  const res = await guardedFetch(url, { timeoutMs: 20_000 });
  if (res.status !== 200) throw new Error(`frankfurter HTTP ${res.status}`);
  const d = JSON.parse(res.text()) as { date: string; rates: { CNY?: number } };
  const rate = d.rates.CNY;
  if (!rate || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error("frankfurter: unexpected response");
  await sql`INSERT INTO fx_rates (as_of, pair, rate, source_name, source_url) VALUES (${d.date}, 'USD/CNY', ${rate}, '欧洲央行', ${url}) ON CONFLICT DO NOTHING`;
  return { asOf: d.date, rate };
}

export async function fillContextWindows(): Promise<{ filled: number }> {
  const { contextFilled } = await syncLeaderboardCatalog();
  return { filled: contextFilled };
}

export async function refreshLeaderboard(): Promise<{ sources: { ok: number; changed: string[]; failed: Array<{ key: string; error?: string }> }; context: unknown; fx: unknown; prices: unknown; market: unknown; round: Pick<RoundResult, "status" | "runId" | "reason"> }> {
  const states = await fetchSources();
  const fx = await refreshFx().catch((e: Error) => ({ error: e.message }));
  const seeded = await importOfficialPrices().then(({ written }) => ({ written }), (e: Error) => ({ error: e.message }));
  const catalog = await syncLeaderboardCatalog().catch((e: Error) => ({ error: e.message }));
  const market = await syncOpenRouterRankings().catch((e: Error) => ({ error: e.message }));
  const context = "error" in catalog ? catalog : { filled: catalog.contextFilled, modelsUpdated: catalog.modelsUpdated };
  const prices = {
    seeded: "error" in seeded ? seeded : seeded.written,
    synced: "error" in catalog ? catalog : catalog.pricesWritten,
  };
  const round = await runLeaderboardRound();
  const entries = Object.entries(states);
  return {
    sources: {
      ok: entries.filter(([, s]) => s.ok).length,
      changed: entries.filter(([, s]) => s.ok && s.changed).map(([k]) => k),
      failed: entries.filter(([, s]) => !s.ok).map(([key, s]) => ({ key, error: s.error })),
    },
    context,
    fx,
    prices,
    market,
    round: { status: round.status, runId: round.runId, reason: round.reason },
  };
}
