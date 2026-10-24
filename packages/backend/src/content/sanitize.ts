// One body representation for the web page, Markdown export and full RSS: whitelisted HTML.
// External HTML is never executed; images keep their original src and are signed at read time.
import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "hr", "h2", "h3", "h4", "h5", "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody",
  "tfoot", "tr", "th", "td", "caption", "a", "img", "figure", "figcaption", "strong", "em", "b", "i", "u", "s", "del",
  "sup", "sub", "mark", "span", "dl", "dt", "dd", "picture", "video",
];

/** A class naming a promotion block (msr-promo, promo-box …), not text such as "promotion". */
const PROMO_CLASS = /(?:^|[-_])promo(?:$|[-_])/i;

/**
 * Promotions a site places inside its posts and rotates between loads (Microsoft Research puts a
 * different podcast or product box into each post of its feed). They are no part of the post, and
 * keeping them made every fetch look like a new version of the article.
 */
function dropPromotions(html: string): string {
  if (!/promo/i.test(html)) return html;
  const $ = cheerio.load(html, null, false);
  $("[class]")
    .filter((_, el) => ($(el).attr("class") ?? "").split(/\s+/).some((c) => PROMO_CLASS.test(c)))
    .remove();
  return $.html();
}

/**
 * Elements whose content is never article text: dropped with everything inside, where other unknown
 * tags are only unwrapped. A page's <template> blocks held hundreds of thousands of characters of
 * base64 that surfaced as paragraphs.
 */
const DROP_WHOLE = [
  "script", "style", "noscript", "textarea", "option", "iframe", "object", "embed", "applet", "form", "input", "select",
  "button", "label", "fieldset", "legend", "svg", "link", "meta", "base", "title", "head", "template", "audio",
  "map", "area", "frame", "frameset", "track", "source", "param",
  // MathML is unwrapped to its text; its LaTeX source and embedded markup are not text.
  "annotation", "annotation-xml", "mglyph",
];

export function sanitizeBody(html: string, baseUrl?: string): string {
  const cleaned = sanitizeHtml(dropPromotions(html), {
    allowedTags: ALLOWED_TAGS,
    nonTextTags: DROP_WHOLE,
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "width", "height", "title"],
      video: ["src", "poster", "width", "height"],
      code: ["class"],
      pre: ["class"],
      th: ["colspan", "rowspan", "align"],
      td: ["colspan", "rowspan", "align"],
      span: [],
    },
    allowedClasses: { code: [/^language-[\w-]+$/], pre: [/^language-[\w-]+$/] },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: true,
    transformTags: {
      h1: "h2",
      h6: "h5",
      div: (tagName, attribs) => ({ tagName: "p", attribs }),
      section: "p",
      article: "p",
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, ...(attribs.href ? { href: resolveUrl(attribs.href, baseUrl) } : {}) },
      }),
      img: (tagName, attribs) => {
        const src = unwrapProxyUrl(attribs["data-src"] || attribs["data-original"] || attribs.src || "");
        return { tagName, attribs: { ...attribs, src: resolveUrl(src, baseUrl) } };
      },
      video: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, ...(attribs.poster ? { poster: resolveUrl(unwrapProxyUrl(attribs.poster), baseUrl) } : {}) },
      }),
    },
    // Empty paragraphs go in normalizeBlocks, which sees nested images: a frame only knows its direct
    // children, and a paragraph holding a linked chart (<p><a><img></a></p>) looked empty here.
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !frame.attribs.src) ||
      (frame.tag === "a" && !frame.text.trim() && !frame.mediaChildren?.length),
  });
  return normalizeBlocks(cleaned);
}

const BLOCK_TAGS = new Set(["p", "h2", "h3", "h4", "h5", "ul", "ol", "li", "blockquote", "pre", "table", "figure", "hr", "dl", "picture", "video"]);

/**
 * Re-parses the sanitised HTML the way browsers do: a block element closes an open paragraph, so
 * containers turned into <p> (nested divs) no longer leave nested or empty paragraphs behind. Empty
 * paragraphs are dropped and loose top-level text is wrapped in its own paragraph.
 */
export function normalizeBlocks(html: string): string {
  const $ = cheerio.load(html, null, false);
  $("p").each((_, el) => {
    const p = $(el);
    if (!p.text().trim() && !p.find("img, video, picture").length) p.remove();
  });
  const out: string[] = [];
  let run: string[] = [];
  let meaningful = false;
  const flush = () => {
    if (meaningful) out.push(`<p>${run.join("").trim()}</p>`);
    run = [];
    meaningful = false;
  };
  for (const node of $.root().contents().toArray()) {
    if (node.type === "tag" && BLOCK_TAGS.has(node.name)) {
      flush();
      out.push($.html(node));
    } else if (node.type === "text" || node.type === "tag") {
      run.push($.html(node));
      if ($(node).text().trim() || (node.type === "tag" && $(node).is("img, a:has(img), br") && node.name !== "br")) meaningful = true;
    }
  }
  flush();
  return out.join("").trim();
}

/**
 * Short blocks a news page puts after the article (TechCrunch ends in "Topics", "Subscribe for the
 * industry's biggest tech news", "Latest in AI"). Only headings and calls to action without a full
 * stop, only at the very end of an extracted page, one block at a time: an article's own sentences stay.
 */
const TRAILING_CHROME = [
  /^topics$/i, /^tags?$/i, /^latest in [\p{L}\s&-]{1,30}$/iu, /^latest (?:news|stories)$/i, /^most (?:popular|read)$/i,
  /^related (?:articles|posts|stories|content|reading|coverage)$/i, /^more (?:stories|articles|news)$/i, /^(?:keep reading|read next|up next)$/i,
  /^(?:you (?:might|may) also like|recommended(?: for you)?)$/i, /^(?:subscribe|sign up)\b.{0,80}$/i, /^share (?:this|on)\b.{0,40}$/i,
  /^follow us\b.{0,40}$/i, /^advertisement$/i,
];

export function trimTrailingChrome(html: string): string {
  const $ = cheerio.load(html, null, false);
  let blocks = $.root().children().toArray();
  let removed = false;
  while (blocks.length > 1) {
    const last = $(blocks[blocks.length - 1]!);
    const text = collapse(last.text());
    if (last.find("img, video, picture").length || /[.。!！?？:：]$/.test(text) || !TRAILING_CHROME.some((re) => re.test(text))) break;
    last.remove();
    blocks = blocks.slice(0, -1);
    removed = true;
  }
  return removed ? $.html() : html;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const OWN_PROXY = /^(?:https?:\/\/[^/?#]+)?\/api\/img-proxy\?/i;

/**
 * The image an address of our own image proxy stands for. Legacy bodies were saved with the proxy's
 * relative address (`/api/img-proxy?u=…&exp=…&sig=…`); resolved against the article's own site it
 * pointed nowhere. The source image is the `u` it wraps, signed again when a page is served.
 */
export function unwrapProxyUrl(src: string): string {
  const s = src.trim();
  if (!OWN_PROXY.test(s)) return src;
  const u = new URLSearchParams(s.slice(s.indexOf("?") + 1).replace(/&amp;/g, "&")).get("u");
  return u && /^https?:\/\//i.test(u) ? u : src;
}

/** Stored bodies: every image and video poster wrapped in our proxy points at its source again. */
export function unwrapProxiedImages(html: string): string {
  // Quoted attribute values may hold a ">" (an alt text), so a tag ends only outside quotes.
  return html.replace(/<(?:img|video)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) =>
    tag.replace(/(\s(?:src|poster)=")([^"]*)(")/gi, (match, pre: string, value: string, post: string) => {
      const url = value.replace(/&amp;/g, "&");
      const unwrapped = unwrapProxyUrl(url);
      return unwrapped === url ? match : `${pre}${unwrapped.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}${post}`;
    }),
  );
}

function resolveUrl(href: string, base?: string): string {
  if (!href) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Strips 2md / web-scraper artifacts, X signup modals, and engagement footers from tweet text. */
export function cleanTweetText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText;

  // 1. Truncate trailing X login/signup footers and legal garbage
  const cutOffPatterns = [
    /\n+##\s+Log in or sign up[\s\S]*/i,
    /\n+See what[’']s happening and join the conversation[\s\S]*/i,
    /\n+\[Log in with username or email\][\s\S]*/i,
    /\n+\[Terms\]\(https:\/\/x\.com\/tos\)[\s\S]*/i,
    /\n+Don['’]t miss what['’]s happening[\s\S]*/i,
    /\n+New to X\?[\s\S]*/i,
  ];
  for (const pat of cutOffPatterns) {
    text = text.replace(pat, "");
  }

  // 2. Strip trailing tweet action bars / reply engagement counts
  text = text.replace(/\n*\[\d+\]\(https:\/\/x\.com\/compose\/post\?[^\)]+\)[\s\d\.KkMmBb]*$/gi, "");
  text = text.replace(/\s+\[\d+\]\(https:\/\/x\.com\/compose\/post\?[^\)]+\)[\s\d\.KkMmBb]*$/gi, "");
  text = text.replace(/\n*\b\d+\s+\d+[KkMm]?\s+\d+[KkMm]?\s*$/g, "");

  // 3. Fix broken markdown links or orphan brackets from initial regex replacements
  text = text.replace(/^\]\([^\)]+\)\s*/g, "");
  text = text.replace(/^\[!\[Image.*?\]\(.*?\)\]\s*/g, "");

  // 4. Remove leading reply mention leftovers if any
  text = text.replace(/^[^\n]*?detects scam emails \[@\w+\]\(.*?\) \[\w+\]\(https:\/\/x\.com\/.*?\/status\/\d+\)\s*/i, "");
  text = text.replace(/^.*?\[@\w+\]\(https:\/\/x\.com\/\w+\)\s+\[\w+\]\(https:\/\/x\.com\/\w+\/status\/\d+\)\s*/i, "");

  return text.trim();
}

/** Converts tweet text into clean, readable HTML with clickable links, @mentions, and #hashtags. */
export function tweetTextToHtml(text: string): string {
  const cleaned = cleanTweetText(text);
  if (!cleaned) return "";

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = esc(cleaned);

  // Replace markdown links: [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2 font-medium">$1</a>');

  // Replace bare URLs (not already part of an href)
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2 break-all">$2</a>');

  // Replace @mentions: @handle -> link to X profile
  html = html.replace(/(^|[\s(])@([A-Za-z0-9_]{1,20})\b/g, '$1<a href="https://x.com/$2" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline font-medium">@$2</a>');

  // Replace #hashtags
  html = html.replace(/(^|[\s(])#([A-Za-z0-9_\u4e00-\u9fa5]+)\b/g, '$1<a href="https://x.com/hashtag/$2" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">#$2</a>');

  return html
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="leading-[1.75] mb-3">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Plain paragraphs to HTML, for sources that only give text (X posts, translations). */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
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

export function formatTableCell(cell: string): string {
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

  const esc = (str: string) =>
    str
      .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s"'<>\)]+)\)/g, (_m, text: string, url: string) => {
    if (/["'<>]/.test(url)) return text;
    try {
      const parsed = new URL(url.replace(/&amp;/g, "&"));
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
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

