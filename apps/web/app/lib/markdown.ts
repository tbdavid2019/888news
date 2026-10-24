// Minimal Markdown → HTML for our own static site copy (legal pages, about, agent guide).
// Trusted input only: never used for third-party content.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string, site: string): string {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
    // A link to this site's own address becomes an in-site path; any other address opens in a new tab.
    const own = href === site || href.startsWith(`${site}/`);
    const external = /^https?:\/\//.test(href) && !own;
    const h = own ? href.slice(site.length) || "/" : href;
    return `<a href="${h}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
  });
  // Bare URLs.
  out = out.replace(/(^|[\s（(])((?:https?:\/\/)[^\s<）)]+)/g, (_m, pre: string, url: string) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  return out;
}

export function slugifyHeading(text: string, i: number): string {
  return `s${i + 1}`;
}

export interface RenderedCopy {
  html: string;
  outline: Array<{ id: string; text: string }>;
}

/** `site` is the site's own address (seo.ts siteUrl()), so links to it stay on the site. */
export function renderMarkdown(md: string, site: string): RenderedCopy {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  const outline: RenderedCopy["outline"] = [];
  let i = 0;
  let h = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      const id = slugifyHeading(text, h++);
      if (level === 2) outline.push({ id, text });
      html.push(`<h${level} id="${id}">${inline(text, site)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i]!)) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      html.push(`<table><thead><tr>${(head ?? []).map((c) => `<th>${inline(c, site)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, site)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) buf.push(lines[i++]!.replace(/^>\s?/, ""));
      html.push(`<blockquote><p>${inline(buf.join(" "), site)}</p></blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.．]\s+/.test(line)) {
      const ordered = /^\s*\d+[.．]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]!) || /^\s*\d+[.．]\s+/.test(lines[i]!) || (/^\s{2,}\S/.test(lines[i]!) && items.length))) {
        const l = lines[i]!;
        if (/^\s{2,}\S/.test(l) && !/^\s*[-*]\s+/.test(l) && !/^\s*\d+[.．]\s+/.test(l)) items[items.length - 1] += ` ${l.trim()}`;
        else items.push(l.replace(/^\s*(?:[-*]|\d+[.．])\s+/, ""));
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((it) => `<li>${inline(it, site)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,4}\s|\||>|\s*[-*]\s|\s*\d+[.．]\s)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    html.push(`<p>${inline(para.join(""), site)}</p>`);
  }
  return { html: html.join("\n"), outline };
}

export interface CopyDocument {
  title: string;
  meta: Record<string, string>;
  intro: string | null;
  body: string;
}

/**
 * Splits a page copy file (industry/pages/) into its page parts: the first heading (title), the meta table,
 * the page-top statement (页首说明) and the verbatim body starting at the first "## " section.
 */
export function parseCopyFile(md: string, firstSection = /^## /m): CopyDocument {
  const title = (/^#\s+(.+)$/m.exec(md)?.[1] ?? "").replace(/（现行版）|（现网）/g, "").trim();
  const meta: Record<string, string> = {};
  for (const m of md.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm)) {
    if (m[1] !== "项" && !/^-+$/.test(m[1]!)) meta[m[1]!] = m[2]!;
  }
  const introMatch = /页首说明：\s*\n+((?:>.*\n?)+)/.exec(md);
  const intro = introMatch ? introMatch[1]!.replace(/^>\s?/gm, "").replace(/\n/g, "").trim() : null;
  const start = md.search(firstSection);
  return { title, meta, intro, body: start >= 0 ? md.slice(start) : md };
}

export function formatArticleSummary(summary: string): string {
  if (!summary) return "";
  // If it already contains line breaks or markdown list syntax, leave as-is
  if (summary.includes("\n") || /^\s*[-*]\s+/m.test(summary)) {
    return summary;
  }
  // If it is a single block with multiple sentences, split lead sentence and format supporting points
  const match = summary.match(/^([^。！？\n]+[。！？])\s*(.+)$/);
  if (match) {
    const [, lead, rest] = match;
    // Check if the rest has semicolons separating points
    if (rest.includes("；")) {
      const parts = rest.split(/；\s*/).map((p) => p.trim()).filter(Boolean);
      // Filter out trailing incomplete fragments (e.g. truncated mid-sentence ending with comma or colon)
      const validParts = parts.filter((p) => p.length >= 8 && !/[,，、：:\s]$/.test(p));
      if (validParts.length >= 2) {
        const bullets = validParts.map((p) => `- ${/[。！？]$/.test(p) ? p : p + "。"}`).join("\n");
        return `${lead}\n\n${bullets}`;
      } else if (validParts.length === 1) {
        const single = validParts[0]!;
        return `${lead}\n\n- ${/[。！？]$/.test(single) ? single : single + "。"}`;
      }
    }
    // If the rest contains 2 or more complete sentences, format as bullet points for readability
    const subSentences = rest.split(/(?<=[。！？])\s*/).map((s) => s.trim()).filter(Boolean);
    if (subSentences.length >= 2) {
      const bullets = subSentences.map((s) => `- ${s}`).join("\n");
      return `${lead}\n\n${bullets}`;
    }
    return `${lead}\n\n${rest}`;
  }
  return summary;
}

/** Splits a Markdown table row into trimmed cells, respecting escaped pipes and inline code spans. */
export function splitTableRow(line: string): string[] {
  let s = line.trim().replace(/^\||\|$/g, "");
  s = s.replace(/\\\|/g, "\uE001");
  const codeSpans: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSpans.push(code);
    return `\uE002${codeSpans.length - 1}\uE002`;
  });
  const rawCells = s.split("|");
  return rawCells.map((c) => {
    let restored = c.trim().replace(/\uE002(\d+)\uE002/g, (_m, idx) => `\`${codeSpans[Number(idx)]}\``);
    restored = restored.replace(/\uE001/g, "|");
    return restored;
  });
}

function formatTableCell(cell: string): string {
  // Preserve already-safe inline HTML tags if this cell comes from legacy convertMarkdownToHtml
  const safeTokens: string[] = [];
  let s = cell.replace(/<a\s+href="(https?:\/\/[^"\s<>]+)"(?:\s+[^>]+)?>([\s\S]*?)<\/a>/gi, (match, href, text) => {
    try {
      const u = new URL(href);
      if (u.protocol === "http:" || u.protocol === "https:") {
        safeTokens.push(`<a href="${u.href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
        return `\uE003${safeTokens.length - 1}\uE003`;
      }
    } catch {}
    return match;
  });
  s = s.replace(/<(strong|b|em|i|code|del)>([\s\S]*?)<\/\1>/gi, (match) => {
    safeTokens.push(match);
    return `\uE003${safeTokens.length - 1}\uE003`;
  });

  const escCell = (str: string) =>
    str
      .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  let out = escCell(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s"'<>\)]+)\)/g, (_m, text: string, url: string) => {
    if (/["'<>]/.test(url)) return text;
    try {
      const parsed = new URL(url.replace(/&amp;/g, "&"));
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `<a href="${escCell(parsed.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
    } catch {
      // invalid URL
    }
    return text;
  });
  out = out.replace(/\uE003(\d+)\uE003/g, (_m, idx) => safeTokens[Number(idx)] ?? "");
  return out;
}

/** Parses a contiguous block of Markdown table lines into an HTML <table>, or null if invalid. */
export function parseTableLines(lines: string[]): { tableHtml: string; startIdx: number; endIdx: number } | null {
  const delimiterIdx = lines.findIndex((l) => {
    const trimmed = l.trim();
    if (!trimmed.includes("|")) return false;
    const cells = splitTableRow(trimmed);
    return cells.length >= 1 && cells.every((c) => /^:?-+:?$/.test(c));
  });

  if (delimiterIdx <= 0) return null;

  // Header must be strictly the single line immediately preceding the delimiter row
  const headerLine = lines[delimiterIdx - 1]!.trim();
  if (!headerLine.includes("|")) return null;

  const delimiterCells = splitTableRow(lines[delimiterIdx]!.trim());
  const headerCells = splitTableRow(headerLine);
  if (headerCells.length !== delimiterCells.length) return null;

  const alignments = delimiterCells.map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });

  const delimiterTrimmed = lines[delimiterIdx]!.trim();
  const delimiterHasLeadingPipe = delimiterTrimmed.startsWith("|");

  let endIdx = delimiterIdx + 1;
  while (endIdx < lines.length) {
    const rowTrimmed = lines[endIdx]!.trim();
    if (!rowTrimmed.includes("|")) break;
    if (delimiterHasLeadingPipe && !rowTrimmed.startsWith("|")) break;
    const rowCells = splitTableRow(rowTrimmed);
    if (rowCells.length !== headerCells.length) break;
    if (rowCells.every((c) => /^:?-+:?$/.test(c))) break;
    endIdx++;
  }

  const bodyLines = lines.slice(delimiterIdx + 1, endIdx);
  const rows = bodyLines.map((l) => splitTableRow(l.trim()));

  const alignAttr = (i: number) => (alignments[i] ? ` align="${alignments[i]}"` : "");

  const thead = `<thead><tr>${headerCells.map((c, i) => `<th${alignAttr(i)}>${formatTableCell(c)}</th>`).join("")}</tr></thead>`;
  const tbody = rows.length > 0 ? `<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${alignAttr(i)}>${formatTableCell(c)}</td>`).join("")}</tr>`).join("")}</tbody>` : "";
  const tableHtml = `<table>${thead}${tbody}</table>`;

  return { tableHtml, startIdx: delimiterIdx - 1, endIdx };
}

/**
 * Detects unrendered Markdown tables inside HTML paragraphs (e.g. `<p>| H1 | H2 |<br>|---|---|<br>| D1 | D2 |</p>`)
 * and transforms them into semantically structured `<table>` elements with `<thead>` and `<tbody>`.
 */
export function renderTablesInHtml(html: string): string {
  if (!html || !html.includes("|")) return html;

  function parseParagraph(content: string): string {
    if (!content.includes("|")) return `<p>${content}</p>`;

    const lines = content.split(/<br\s*\/?>|\n/);
    const parsed = parseTableLines(lines);
    if (!parsed) return `<p>${content}</p>`;

    const beforeLines = lines.slice(0, parsed.startIdx).map((l) => l.trim()).filter(Boolean);
    const afterLines = lines.slice(parsed.endIdx).map((l) => l.trim()).filter(Boolean);

    const beforeHtml = beforeLines.length > 0 ? parseParagraph(beforeLines.join("<br>")) : "";
    const afterHtml = afterLines.length > 0 ? parseParagraph(afterLines.join("<br>")) : "";

    return `${beforeHtml}${parsed.tableHtml}${afterHtml}`;
  }

  return html.replace(/<p>([\s\S]*?)<\/p>/gi, (_m, content) => parseParagraph(content));
}

export function stripMarkdown(md: string): string {
  if (!md) return "";
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.．]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

