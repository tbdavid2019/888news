// X accounts via SocialData search ("from:handle -filter:replies", newest first). Plain account queries
// are read together, about two dozen accounts per search (planXShards); SocialData bills per request.
import { searchTweets, tweetMedia, tweetText, type SdArticle, type SdTweet } from "../providers/socialdata.ts";
import { ProviderRejectedError } from "../providers/receipts.ts";
import type { XPostData } from "../content/materials.ts";
import { sha256 } from "../lib/ids.ts";
import { FetchError, type Candidate, type SourceRow } from "./types.ts";
import { readPageAsMarkdown } from "../providers/reader.ts";
import { credential } from "../config.ts";

function avatar(url: string | undefined): string | null {
  // Larger avatar than the default 48px thumbnail.
  return url ? url.replace("_normal.", "_bigger.") : null;
}

export function toXPost(t: SdTweet): XPostData {
  const q = t.quoted_status ?? null;
  return {
    tweetId: t.id_str,
    authorName: t.user.name,
    handle: t.user.screen_name,
    avatarUrl: avatar(t.user.profile_image_url_https),
    text: tweetText(t),
    lang: t.lang ?? null,
    replyTo: t.in_reply_to_status_id_str ?? null,
    media: tweetMedia(t),
    quoted: q
      ? { authorName: q.user.name, handle: q.user.screen_name, text: tweetText(q), url: `https://x.com/${q.user.screen_name}/status/${q.id_str}`, media: tweetMedia(q) }
      : null,
  };
}

const X_ARTICLE_LINK = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/article\/\d+/gi;

/** The post links an X Article (long-form text posted on X): its body is fetched before judging. */
export function linksXArticle(text: string | null | undefined): boolean {
  return new RegExp(X_ARTICLE_LINK.source, "i").test(text ?? "");
}

/** Nothing but the article's link: without the article there is nothing to judge (under 30 characters left). */
export function onlyXArticleLink(text: string | null | undefined): boolean {
  return linksXArticle(text) && (text ?? "").replace(X_ARTICLE_LINK, "").trim().length < 30;
}

/** An X Article as plain text with Markdown-like headings, quotes and list marks; media blocks are left out. */
export function xArticleText(article: SdArticle): { title: string; text: string } | null {
  const lines: string[] = [];
  for (const b of article.content_state?.blocks ?? []) {
    const text = (b.text ?? "").trim();
    if (!text || b.type === "atomic") continue;
    const mark = { "header-one": "# ", "header-two": "## ", "header-three": "### ", blockquote: "> ", "unordered-list-item": "- ", "ordered-list-item": "1. " }[b.type ?? ""] ?? "";
    lines.push(mark + text);
  }
  const text = lines.join("\n\n").trim();
  return text ? { title: (article.title ?? "").trim(), text } : null;
}

export function tweetToCandidate(t: SdTweet): Candidate {
  const post = toXPost(t);
  const firstLine = post.text.split("\n").find((l) => l.trim()) ?? post.text;
  return {
    url: `https://x.com/${t.user.screen_name}/status/${t.id_str}`,
    identityKey: `x:${t.id_str}`,
    title: firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine,
    author: t.user.screen_name,
    language: t.lang ?? null,
    publishedAt: new Date(t.tweet_created_at),
    bodyText: [post.text, post.quoted ? `\n\n【引用 @${post.quoted.handle}】${post.quoted.text}` : ""].join("").trim(),
    // A linked X Article is the post's real body: extraction fetches it (jobs/content.ts route).
    bodyStatus: linksXArticle(post.text) ? "pending" : "ok",
    xPost: post,
    media: post.media ?? [],
    raw: { favorite: t.favorite_count ?? null, retweet: t.retweet_count ?? null, views: t.views_count ?? null },
  };
}

/** Half-hour receipt window: a retried fetch in the same window reuses the paid response. */
function windowKey(now = Date.now()): string {
  return new Date(Math.floor(now / 1_800_000) * 1_800_000).toISOString();
}

/** Pages of new posts read per run after a watermark; a longer search continues in later runs. */
const MAX_PAGES = 10;
/** Pages per run spent on older stretches left over from earlier runs. */
const MAX_BACKLOG_PAGES = 10;
/** Stretches kept per source; beyond this the oldest is given up and reported. */
const MAX_BACKLOG = 5;

/** Where a newest-first search stopped at the page limit: the same query continues from `next`. */
export interface XBacklog {
  query: string;
  next: string;
}

export interface XRead {
  tweets: SdTweet[];
  lastId: string | null;
  /** Stretches still to read, oldest first (kept in the source cursor). */
  backlog: XBacklog[];
  pages: number;
  /** The new-post search stopped at the page limit; the rest joined the backlog. */
  truncated: boolean;
  backlogPages: number;
  /** Stretches given up (too many, or the provider refused to continue one): posts in them may be missing. */
  dropped: number;
}

export interface XFetch extends Omit<XRead, "tweets"> {
  candidates: Candidate[];
}

/**
 * New posts since the watermark. The search is bounded by since_id, so every further page holds older
 * posts that are still new to us. A search longer than one run's pages (a long outage) moves the
 * watermark to the newest post and keeps its position; later runs read on from there until it reaches
 * the old watermark, so nothing in between is skipped. Without a watermark (a source's very first
 * fetch) one page is read: its import is bounded anyway.
 */
export async function readXSearch(base: string, opts: { lastId: string | null; backlog: XBacklog[]; subject: string; type?: "Latest" | "Top" }): Promise<XRead> {
  const { lastId } = opts;
  const backlog = opts.backlog.map((b) => ({ ...b }));
  const window = windowKey();
  const search = (query: string, cursor: string | null) =>
    searchTweets(query, { purpose: "source_fetch", subject: opts.subject, window, type: opts.type ?? "Latest", cursor });
  const all: SdTweet[] = [];
  const query = lastId ? `${base} since_id:${lastId}` : base;
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;
  for (;;) {
    let res: Awaited<ReturnType<typeof search>>;
    try {
      res = await search(query, cursor);
    } catch (error) {
      // A later page failing keeps the pages already read; the search goes on from there next run.
      if (!cursor) throw error;
      truncated = true;
      backlog.push({ query, next: cursor });
      break;
    }
    pages += 1;
    all.push(...res.tweets);
    if (!lastId || !res.nextCursor || res.tweets.length === 0) break;
    if (pages >= MAX_PAGES) {
      truncated = true;
      backlog.push({ query, next: res.nextCursor });
      break;
    }
    cursor = res.nextCursor;
  }

  // Older stretches, oldest first. Budget, account or passing trouble leaves them for the next run; a
  // position the provider refuses as a bad request (an expired cursor) is given up.
  let dropped = 0;
  while (backlog.length > MAX_BACKLOG) {
    backlog.shift();
    dropped += 1;
  }
  let backlogPages = 0;
  while (backlog.length > 0 && backlogPages < MAX_BACKLOG_PAGES) {
    const stretch = backlog[0]!;
    let res: Awaited<ReturnType<typeof search>>;
    try {
      res = await search(stretch.query, stretch.next);
    } catch (error) {
      if (error instanceof ProviderRejectedError && (error.status === 400 || error.status === 422)) {
        backlog.shift();
        dropped += 1;
        continue;
      }
      break;
    }
    backlogPages += 1;
    all.push(...res.tweets);
    if (!res.nextCursor || res.tweets.length === 0) backlog.shift();
    else stretch.next = res.nextCursor;
  }

  const seen = new Set<string>();
  const tweets = all.filter((t) => !t.retweeted_status && !seen.has(t.id_str) && !!seen.add(t.id_str));
  const maxId = tweets.reduce<string | null>((m, t) => (m === null || BigInt(t.id_str) > BigInt(m) ? t.id_str : m), lastId);
  return { tweets, lastId: maxId, backlog, pages, truncated, backlogPages, dropped };
}

export function extractHandle(source: Pick<SourceRow, "id" | "config" | "name">): string | null {
  if (typeof source.config?.handle === "string" && source.config.handle.trim() && source.config.handle.toLowerCase() !== "handle") {
    return source.config.handle.trim().replace(/^@/, "");
  }
  const query = String(source.config?.query ?? "");
  const m = /from:([A-Za-z0-9_]{1,20})/i.exec(query);
  if (m && m[1] && m[1].toLowerCase() !== "handle") return m[1];
  if (typeof source.config?.url === "string") {
    const urlMatch = /x\.com\/([A-Za-z0-9_]{1,20})/i.exec(source.config.url);
    if (urlMatch && urlMatch[1] && !["home", "explore", "search", "handle"].includes(urlMatch[1].toLowerCase())) return urlMatch[1];
  }
  if (source.id.startsWith("x-")) return source.id.replace(/^x-/, "");
  if (source.id && source.id.toLowerCase() !== "handle") return source.id;
  return null;
}

/** Crawls recent tweets from an X profile using 2md.aiurl.tw without requiring paid API keys. */
export async function fetchXVia2md(source: SourceRow): Promise<XFetch> {
  const handle = extractHandle(source);
  if (!handle) throw new FetchError(`無法從信源 ${source.id} 判斷 X / Twitter 帳號 handle`);

  const page = await readPageAsMarkdown(`https://x.com/${handle}`);
  const statusRegex = new RegExp(`https://x\\.com/${handle}/status/(\\d+)`, "gi");
  const allMatches = Array.from(page.raw.matchAll(statusRegex));
  const seenIds = new Set<string>();
  const tweetIds: string[] = [];
  for (const m of allMatches) {
    const id = m[1]!;
    if (!seenIds.has(id)) {
      seenIds.add(id);
      tweetIds.push(id);
    }
  }

  const candidates: Candidate[] = [];
  const blocks = page.markdown.split(/\n(?=\*\s+)/);

  for (const block of blocks) {
    if (!block.trimStart().startsWith("*")) continue;
    const statusMatch = new RegExp(`https://x\\.com/${handle}/status/(\\d+)`, "i").exec(block) ||
      new RegExp(`https://x\\.com/[A-Za-z0-9_]+/status/(\\d+)`, "i").exec(block);

    let text = block
      .replace(/\*?\s*\[!\[Image.*?\]\(.*?\)\]\(.*?\)/g, "")
      .replace(/\[!\[Image.*?\]\(.*?\)\]/g, "")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[(?:Log in|Sign up|Continue with.*?|Video \d+)\]\(.*?\)/gi, "")
      .replace(new RegExp(`\\[.*?\\]\\(https://x\\.com/${handle}\\)`, "gi"), "")
      .replace(new RegExp(`\\[.*?\\]\\(https://x\\.com/${handle}/status/\\d+\\)`, "gi"), "")
      .replace(new RegExp(`\\[.*?\\]\\(https://x\\.com/hashtag/.*?\\)`, "gi"), "")
      .trim();

    text = text.replace(/^[^\n]*?@[A-Za-z0-9_]+\s*(?:\[\w+\])?\s*/i, "").trim();

    const mediaUrls = Array.from(block.matchAll(/https:\/\/pbs\.twimg\.com\/(?:media|amplify_video_thumb)\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)/g), (m) => m[0]);
    const media = Array.from(new Set(mediaUrls)).map((url) => ({
      kind: "image" as const,
      url,
      width: null,
      height: null,
      poster: null,
    }));

    if (!text && media.length === 0) continue;
    if (text.length < 5 && media.length === 0) continue;

    const tweetId = statusMatch ? statusMatch[1]! : sha256(`${handle}:${text}`).slice(0, 16);
    if (candidates.some((c) => c.identityKey === `x:${tweetId}`)) continue;

    const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
    const title = firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine || `${source.name || handle} 於 X 發布動態`;
    const tweetUrl = statusMatch ? `https://x.com/${handle}/status/${tweetId}` : `https://x.com/${handle}#${tweetId}`;

    candidates.push({
      url: tweetUrl,
      identityKey: `x:${tweetId}`,
      title,
      author: handle,
      language: null,
      publishedAt: new Date(),
      bodyText: text,
      bodyStatus: "ok",
      xPost: {
        tweetId,
        authorName: source.name || handle,
        handle,
        avatarUrl: null,
        text,
        lang: null,
        replyTo: null,
        media,
        quoted: null,
      },
      media,
      raw: {},
    });
  }

  for (const id of tweetIds.slice(0, 10)) {
    if (!candidates.some((c) => c.identityKey === `x:${id}`)) {
      candidates.push({
        url: `https://x.com/${handle}/status/${id}`,
        identityKey: `x:${id}`,
        title: `${source.name || handle} 的推文 (${id})`,
        author: handle,
        language: null,
        publishedAt: new Date(),
        bodyText: "",
        bodyStatus: "ok",
        xPost: {
          tweetId: id,
          authorName: source.name || handle,
          handle,
          avatarUrl: null,
          text: "",
          lang: null,
          replyTo: null,
          media: [],
          quoted: null,
        },
        media: [],
        raw: {},
      });
    }
  }

  return {
    candidates,
    lastId: candidates[0]?.xPost?.tweetId ?? null,
    backlog: [],
    pages: 1,
    truncated: false,
    backlogPages: 0,
    dropped: 0,
  };
}

/** One account's own search (supports 2md.aiurl.tw zero-cost reader and SocialData API). */
export async function fetchXSearch(source: SourceRow): Promise<XFetch> {
  const hasSocialDataKey = Boolean(credential("collectors", "SOCIALDATA_API_KEY"));
  if (!hasSocialDataKey) {
    return fetchXVia2md(source);
  }
  try {
    const base = String(source.config.query ?? "");
    if (!base) return fetchXVia2md(source);
    const { tweets, ...read } = await readXSearch(base, {
      lastId: source.cursor?.lastTweetId ?? null,
      backlog: Array.isArray(source.cursor?.xBacklog) ? source.cursor.xBacklog : [],
      subject: `source:${source.id}`,
      type: source.config.searchType ?? "Latest",
    });
    return { candidates: tweets.map(tweetToCandidate), ...read };
  } catch (err) {
    console.warn(`[X Collector] SocialData unavailable or error, falling back to 2md.aiurl.tw:`, err);
    return fetchXVia2md(source);
  }
}

// --- Shards: plain account queries read together ------------------------------------------------

/** A query that can share a search: exactly "from:handle -filter:replies", newest first. */
const SHARDABLE = /^from:([A-Za-z0-9_]{1,15}) -filter:replies$/i;
/** The same test in SQL, for the schedulers. */
export const SHARDABLE_SQL = "^from:[A-Za-z0-9_]{1,15} -filter:replies$";
/** SocialData refuses queries over 512 characters; the since_id watermark takes about 30 of them. */
const SHARD_QUERY_MAX = 470;
const SHARD_MAX_ACCOUNTS = 24;

/** The account a source reads, when it can share a search: a plain query and a watermark already set. */
export function shardHandle(s: Pick<SourceRow, "kind" | "config" | "cursor">): string | null {
  if (s.kind !== "x_search" || (s.config.searchType ?? "Latest") !== "Latest" || !s.cursor?.lastTweetId) return null;
  return SHARDABLE.exec(String(s.config.query ?? ""))?.[1] ?? null;
}

export function shardQuery(handles: string[]): string {
  return `(${handles.map((h) => `from:${h}`).join(" OR ")}) -filter:replies`;
}

export interface XShard {
  key: string;
  mode: string;
  sourceIds: string[];
}

/**
 * Accounts that can share a search, per participation mode, in a stable order (by source id) and
 * packed into queries under the length limit. The same sources give the same shards, so a shard's
 * accounts stay together between runs; a source added or removed shifts only the shards after it.
 */
export function planXShards(sources: Array<Pick<SourceRow, "id" | "kind" | "config" | "cursor" | "participation_mode">>): XShard[] {
  const byMode = new Map<string, Array<{ id: string; handle: string }>>();
  for (const s of sources) {
    const handle = shardHandle(s);
    if (handle) byMode.set(s.participation_mode, [...(byMode.get(s.participation_mode) ?? []), { id: s.id, handle }]);
  }
  const shards: XShard[] = [];
  for (const [mode, list] of [...byMode].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let current: typeof list = [];
    const close = () => {
      if (current.length) shards.push({ mode, sourceIds: current.map((c) => c.id), key: `${mode}:${sha256(current.map((c) => c.id).join(",")).slice(0, 12)}` });
      current = [];
    };
    for (const s of list) {
      if (current.length >= SHARD_MAX_ACCOUNTS || shardQuery([...current, s].map((c) => c.handle)).length > SHARD_QUERY_MAX) close();
      current.push(s);
    }
    close();
  }
  return shards;
}
