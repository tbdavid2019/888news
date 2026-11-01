// Search web endpoint for public question context; configurable and bounded.
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
  if (process.env.ASK_WEB_SEARCH_ENABLED === "false") return [];
  if (running >= 4) throw new Error("Search capacity exhausted");
  running++;
  try {
    const rawBase = process.env.ASK_SEARCH_URL || process.env.URL2MD_BASE_URL || "https://2md.aiurl.tw";
    const endpoint = rawBase.endsWith("/search") ? rawBase : `${rawBase.replace(/\/+$/, "")}/search`;
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    const res = await guardedFetch(url.href, { headers: { accept: "application/json" }, timeoutMs: 10_000, maxBytes: 256 * 1024, maxRedirects: 0 });
    if (res.status !== 200) throw new Error("Search unavailable");
    return parseAskSearch(JSON.parse(res.text()));
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", msg: "web search failed", error: String(error).slice(0, 200) }));
    throw error;
  } finally {
    running--;
  }
}
