// Search 2md's fixed search endpoint; no user-supplied URL is fetched.
import { guardedFetch } from "../lib/http-fetch.ts";

export interface AskWebResult { title: string; description: string; url: string }

export function parseAskSearch(value: unknown): AskWebResult[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) throw new Error("Invalid search response");
  const results: AskWebResult[] = [];
  for (const entry of (value as { data: unknown[] }).data.slice(0, 30)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.url !== "string") continue;
    try {
      const url = new URL(row.url);
      if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password) continue;
      results.push({ title: row.title.slice(0, 300), description: typeof row.description === "string" ? row.description.slice(0, 1200) : "", url: url.href });
    } catch { continue; }
    if (results.length === 8) break;
  }
  return results;
}

let running = 0;
export async function searchAskWeb(query: string): Promise<AskWebResult[]> {
  if (running >= 4) throw new Error("Search capacity exhausted");
  running++;
  try {
    const url = new URL("https://2md.aiurl.tw/search");
    url.searchParams.set("q", query);
    const res = await guardedFetch(url.href, { headers: { accept: "application/json" }, timeoutMs: 10_000, maxBytes: 256 * 1024, maxRedirects: 0 });
    if (res.status !== 200) throw new Error("Search unavailable");
    return parseAskSearch(JSON.parse(res.text()));
  } finally {
    running--;
  }
}
