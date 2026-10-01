// Universal Web Reader for dynamic / anti-scraping protected pages.
// Uses 2md.aiurl.tw (888-url2md) with jitter retry and circuit breaker protection.
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";

export interface ReaderPage {
  title: string | null;
  url: string | null;
  publishedTime: string | null;
  markdown: string;
  raw: string;
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

export async function readPageAsMarkdown(
  targetUrl: string,
  _opts?: { purpose?: string; subject?: string; cacheToleranceSeconds?: number; perRead?: boolean },
): Promise<ReaderPage> {
  const base = (credential("collectors", "READER_BASE_URL") ?? process.env.READER_BASE_URL ?? process.env.JINA_BASE_URL ?? "https://2md.aiurl.tw").replace(/\/$/, "");

  // Anti-thundering herd jitter delay (50-250ms random delay, skipped in tests and local stubs)
  if (process.env.NODE_ENV !== "test" && !process.env.JINA_BASE_URL && !base.includes("127.0.0.1")) {
    const jitterMs = Math.floor(Math.random() * 200) + 50;
    await new Promise((r) => setTimeout(r, jitterMs));
  }

  const endpoint = `${base}/${targetUrl}`;
  const res = await guardedFetch(endpoint, {
    headers: {
      accept: "text/plain",
    },
    timeoutMs: 30_000,
    maxBytes: 8 * 1024 * 1024,
  });

  if (res.status === 200) {
    const text = res.text();
    return parseReaderText(text, targetUrl);
  }

  throw new Error(`[Reader] 2md reader returned HTTP ${res.status} for ${targetUrl}`);
}
