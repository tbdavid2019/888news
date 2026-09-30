// Universal Web Reader for dynamic / anti-scraping protected pages.
// Defaults to 2md.aiurl.tw (888-url2md), with optional fallback to Jina Reader if JINA_API_KEY is configured.
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { jinaRead } from "./jina.ts";

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

  // Check if response has standard Title/URL/Source header block (from 2md or Jina)
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
  opts?: { purpose?: string; subject?: string; cacheToleranceSeconds?: number; perRead?: boolean },
): Promise<ReaderPage> {
  const base = (credential("collectors", "READER_BASE_URL") ?? process.env.READER_BASE_URL ?? "https://2md.aiurl.tw").replace(/\/$/, "");

  try {
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
    } else {
      console.warn(`[Reader] 2md reader returned HTTP ${res.status} for ${targetUrl}`);
    }
  } catch (err) {
    console.warn(`[Reader] 2md reader request failed for ${targetUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fallback to Jina if JINA_API_KEY is configured
  if (credential("collectors", "JINA_API_KEY")) {
    const jinaPage = await jinaRead(targetUrl, {
      purpose: opts?.purpose ?? "reader_fallback",
      subject: opts?.subject ?? targetUrl,
      cacheToleranceSeconds: opts?.cacheToleranceSeconds,
      perRead: opts?.perRead,
    });
    return {
      title: jinaPage.title,
      url: jinaPage.url,
      publishedTime: jinaPage.publishedTime,
      markdown: jinaPage.markdown,
      raw: jinaPage.raw,
    };
  }

  throw new Error(`Failed to read page via reader service at ${base}`);
}
