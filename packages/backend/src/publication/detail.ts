// Item detail and Markdown export, both behind the same visibility and licence rules.
import type { ItemDetail, SiteItemDetail, OutlineEntry, StoryRef } from "@aihot/contracts/site";
import TurndownService from "turndown";
import { sql } from "../db.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { cleanTweetText, renderTablesInHtml, textToHtml, tweetTextToHtml } from "../content/sanitize.ts";
import { ITEM_COLUMNS, ITEM_FROM, selectedCondition, toItemSummary, xView, type ItemRow } from "./items.ts";
import { itemUrl } from "./links.ts";
import { hasItemPage } from "./rules.ts";
import { SITE } from "@aihot/industry/site";
import { stripTags } from "../lib/text.ts";

interface DetailRow extends ItemRow {
  body_html: string | null;
  body_text: string | null;
  body_status: string;
  tr_html: string | null;
  tr_complete: boolean | null;
}

export type DetailResult =
  | { kind: "found"; detail: ItemDetail; row: DetailRow }
  | { kind: "not_found" };

/** Adds stable ids to h2–h4 and returns the outline. */
function withOutline(html: string): { html: string; outline: OutlineEntry[] } {
  const outline: OutlineEntry[] = [];
  let n = 0;
  const out = html.replace(/<h([2-4])(?: id="sec-\d+")?>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    n += 1;
    const id = `sec-${n}`;
    const text = stripTags(inner);
    if (text) outline.push({ id, text: text.slice(0, 80), level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, outline };
}

async function loadRow(id: string): Promise<DetailRow | null> {
  const [row] = await sql<DetailRow[]>`
    SELECT ${ITEM_COLUMNS}, a.body_html, a.body_text, a.body_status, tr.body_html AS tr_html, tr.complete AS tr_complete
    ${ITEM_FROM}
    WHERE p.article_id = ${id}`;
  return row ?? null;
}

/**
 * Public detail (rules.hasItemPage): items the lists leave out (low relevance, merged duplicates, no
 * Chinese summary yet) keep a noindex page; withdrawn and hot_signal items are a 404.
 */
export async function loadItemDetail(id: string, now = new Date()): Promise<DetailResult> {
  const row = await loadRow(id);
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return { kind: "not_found" };

  const summary = toItemSummary(row);
  if (row.channel === "x") summary.x = xView(row, false, true);
  if (row.visibility === "summary-only") {
    const detail: ItemDetail = {
      ...summary,
      reason: null,
      tags: [],
      x: null,
      readingMode: "summary-only",
      author: null,
      language: row.language,
      body: null,
      outline: [],
      relatedStories: [],
      indexable: false,
      markdownAvailable: false,
      group: null,
    };
    return { kind: "found", detail, row };
  }

  const related = await sql<StoryRef[]>`
    SELECT DISTINCT st.public_id::text AS "publicId", st.title
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id JOIN stories st ON st.id = f.story_id
    WHERE fa.article_id = ${id} AND fa.role <> 'mention' AND st.merged_into IS NULL
    LIMIT 6`;

  let body: ItemDetail["body"] = null;
  let outline: OutlineEntry[] = [];
  if (row.channel === "x") {
    const rawText = String(row.x_post?.text ?? row.body_text ?? "");
    const cleanedText = cleanTweetText(rawText);
    const zhText = summary.x?.translation ? cleanTweetText(summary.x.translation) : null;
    body = {
      zh: zhText ? tweetTextToHtml(zhText) : null,
      original: cleanedText ? tweetTextToHtml(cleanedText) : null,
      zhKind: zhText ? "translation" : null,
      complete: true,
    };
  } else if (row.body_mode === "full" && row.body_html) {
    const isZh = row.language === "zh" || (/[一-鿿]/.test(row.body_text?.slice(0, 400) ?? "") && row.language !== "en");
    const original = renderTablesInHtml(proxyBodyImages(row.body_html));
    const zh = isZh ? original : row.tr_html ? renderTablesInHtml(proxyBodyImages(row.tr_html)) : null;
    const primary = withOutline(zh ?? original);
    outline = primary.outline;
    body = {
      zh: zh ? primary.html : null,
      original: zh && !isZh ? withOutline(original).html : isZh ? null : primary.html,
      zhKind: isZh ? "original" : zh ? "translation" : null,
      complete: isZh ? true : row.tr_complete ?? false,
    };
  }

  let group: ItemDetail["group"] = null;
  if (row.fact_id) {
    const [g] = await sql<{ public_id: string; reports: number; sources: number }[]>`
      SELECT f.public_id, count(p.article_id) AS reports, count(DISTINCT p.source_id) AS sources
      FROM facts f JOIN publications p ON p.fact_id = f.id
      WHERE f.id = ${row.fact_id} AND p.visibility = 'public' AND p.eligible AND (NOT p.selected OR p.visible_after <= ${now})
      GROUP BY f.public_id`;
    const [dev] = await sql<{ n: number }[]>`
      SELECT count(DISTINCT other.id) AS n FROM facts f
      JOIN facts other ON other.story_id = f.story_id AND other.id <> f.id
      JOIN publications p ON p.fact_id = other.id
      WHERE f.id = ${row.fact_id} AND f.story_id IS NOT NULL AND ${selectedCondition(now)}`;
    if (g) {
      group = {
        factId: g.public_id,
        story: summary.story,
        reportCount: Number(g.reports),
        additionalSourceCount: Math.max(0, Number(g.sources) - 1),
        developmentCount: Number(dev?.n ?? 0),
      };
    }
  }

  const detail: ItemDetail = {
    ...summary,
    readingMode: "full",
    author: row.author,
    language: row.language,
    body,
    outline,
    relatedStories: related,
    indexable: row.indexable,
    markdownAvailable: markdownAvailable(row),
    group,
  };
  return { kind: "found", detail, row };
}

/**
 * Same predicate for the export button and the export route: a public page with something to export
 * (a summary, the post, or a full-text body).
 */
export function markdownAvailable(row: {
  visibility: string; source_mode: string; summary: string | null; body_mode: string; body_html?: string | null; channel: string; x_post: Record<string, any> | null;
}): boolean {
  if (row.visibility !== "public" || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return false;
  return !!row.summary || (row.channel === "x" && !!row.x_post?.text) || (row.body_mode === "full" && !!row.body_html);
}

function cellToMarkdown(cell: any): string {
  let md = "";
  for (const child of Array.from((cell.childNodes ?? []) as any[])) {
    if (child.nodeType === 3) {
      md += child.textContent ?? "";
    } else if (child.nodeType === 1) {
      const tag = String(child.tagName ?? "").toLowerCase();
      if (tag === "a") {
        const href = String(child.getAttribute?.("href") ?? "");
        const text = String(child.textContent ?? "");
        md += href ? `[${text}](${href})` : text;
      } else if (tag === "strong" || tag === "b") {
        md += `**${child.textContent ?? ""}**`;
      } else if (tag === "code") {
        md += `\`${child.textContent ?? ""}\``;
      } else if (tag === "br") {
        md += " ";
      } else {
        md += child.textContent ?? "";
      }
    }
  }
  return md.trim().replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const el = node as any;
    const directRows: any[] = [];
    for (const child of Array.from((el.children ?? []) as any[])) {
      const tag = String(child.tagName ?? "").toLowerCase();
      if (tag === "tr") {
        directRows.push(child);
      } else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
        for (const sub of Array.from((child.children ?? []) as any[])) {
          if (String(sub.tagName ?? "").toLowerCase() === "tr") {
            directRows.push(sub);
          }
        }
      }
    }

    if (directRows.length === 0) return "";
    const tableLines: string[] = [];
    for (let i = 0; i < directRows.length; i++) {
      const row = directRows[i];
      const cells: string[] = [];
      for (const cell of Array.from((row.children ?? []) as any[])) {
        const tag = String(cell.tagName ?? "").toLowerCase();
        if (tag === "th" || tag === "td") {
          cells.push(cellToMarkdown(cell));
        }
      }
      if (cells.length === 0) continue;
      tableLines.push(`| ${cells.join(" | ")} |`);
      if (i === 0) {
        tableLines.push(`| ${cells.map(() => "---").join(" | ")} |`);
      }
    }
    return `\n\n${tableLines.join("\n")}\n\n`;
  },
});

export async function exportMarkdown(id: string): Promise<{ filename: string; body: string } | null> {
  const row = await loadRow(id);
  if (!row || !markdownAvailable(row)) return null;
  const lines: string[] = [];
  lines.push(`# ${row.title}`, "");
  if (row.original_title) lines.push(`> 原标题：${row.original_title}`, "");
  lines.push(`- 来源：${row.source_name}`);
  lines.push(`- 发布时间：${(row.published_at ?? row.discovered_at).toISOString()}`);
  lines.push(`- ${SITE.name}：${itemUrl(row.id)}`);
  lines.push(`- 原文：${row.url}`, "");
  if (row.summary) lines.push("## 摘要", "", row.summary, "");
  if (row.selected && row.reason) lines.push("## 推荐理由", "", row.reason, "");
  if (row.channel === "x" && row.x_post?.text) {
    lines.push("## 正文", "", String(row.x_post.text), "");
    if (row.zh_text) lines.push("## 中文译文", "", row.zh_text, "");
    const q = row.x_post.quoted as { handle?: string; text?: string; url?: string } | null | undefined;
    if (q?.text) lines.push(`## 引用 @${q.handle ?? ""}`, "", ...String(q.text).split("\n").map((l) => `> ${l}`), "", ...(q.url ? [q.url, ""] : []));
    if (q?.text && row.quoted_zh) lines.push("### 引用中文译文", "", ...row.quoted_zh.split("\n").map((l) => `> ${l}`), "");
  } else if (row.body_mode === "full" && row.body_html) {
    const isZh = row.language === "zh";
    const bodyHtml = renderTablesInHtml(row.body_html);
    const trHtml = row.tr_html ? renderTablesInHtml(row.tr_html) : null;
    if (!isZh && trHtml && row.tr_complete) lines.push("## 正文 · 中文译文", "", turndown.turndown(trHtml), "");
    lines.push(isZh ? "## 正文" : "## 正文 · 原文", "", turndown.turndown(bodyHtml), "");
  }
  return { filename: `${SITE.mcpPrefix}-${row.id}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}

/** Site reading projection: default text remains SSR, a second language has its own readable URL. */
export function siteItemDetail(detail: ItemDetail, original = false): SiteItemDetail {
  const hasTranslation = !!detail.body?.zh && detail.body.zhKind === "translation" && !!detail.body.original;
  const bodyLanguage = original && detail.body?.original ? "original" : detail.body?.zh ? "zh" : "original";
  const selectedHtml = bodyLanguage === "zh" ? detail.body?.zh : detail.body?.original;
  const { text: _text, translation: _translation, ...x } = detail.x ?? {} as NonNullable<ItemDetail["x"]>;
  return { ...detail, x: detail.x ? x : null, hasTranslation, bodyLanguage,
    body: detail.body ? { ...detail.body, zh: bodyLanguage === "zh" ? detail.body.zh : null, original: bodyLanguage === "original" ? detail.body.original : null } : null,
    outline: selectedHtml ? withOutline(selectedHtml).outline : [],
  };
}
