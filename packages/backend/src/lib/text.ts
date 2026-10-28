import { load } from "cheerio";

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function truncate(s: string, max: number, ellipsis = "…"): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(0, max - ellipsis.length)).join("").trimEnd() + ellipsis;
}

export function htmlText(html: string): string {
  const $ = load(html);
  $("script, style, noscript").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr").append("\n");
  return $.root().text();
}

export function stripTags(html: string): string {
  return collapseWhitespace(htmlText(html));
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // XML 1.0 forbids most control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Share of CJK characters among letters; used to decide whether a title needs translation. */
export function cjkRatio(s: string): number {
  const letters = s.match(/[\p{L}]/gu) ?? [];
  if (letters.length === 0) return 0;
  const cjk = s.match(/[㐀-鿿豈-﫿]/g) ?? [];
  return cjk.length / letters.length;
}

export function guessLanguage(s: string): "zh" | "en" | "other" {
  const ratio = cjkRatio(s);
  if (ratio > 0.3) return "zh";
  if (/[a-z]/i.test(s)) return "en";
  return "other";
}
