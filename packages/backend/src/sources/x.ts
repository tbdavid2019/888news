// X accounts via SocialData search ("from:handle -filter:replies", newest first). Plain account queries
// are read together, about two dozen accounts per search (planXShards); SocialData bills per request.
import { searchTweets, tweetMedia, tweetText, type SdArticle, type SdTweet } from "../providers/socialdata.ts";
import { ProviderRejectedError } from "../providers/receipts.ts";
import type { XPostData } from "../content/materials.ts";
import { sha256 } from "../lib/ids.ts";
import { FetchError, type Candidate, type SourceRow } from "./types.ts";
import { readPageAsHtml, readPageAsMarkdown } from "../providers/reader.ts";
import { credential } from "../config.ts";
import { cleanTweetText } from "../content/sanitize.ts";

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
  if (!credential("collectors", "SOCIALDATA_API_KEY")) {
    return { tweets: [], lastId: opts.lastId, backlog: [], pages: 0, truncated: false, backlogPages: 0, dropped: 0 };
  }
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

function cleanHandle(s: string | undefined | null): string | null {
  if (!s) return null;
  let str = s.trim();
  const urlMatch = /(?:^|https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,30})/i.exec(str);
  if (urlMatch && urlMatch[1]) {
    str = urlMatch[1];
  }
  str = str.replace(/^@/, "").replace(/\/+$/, "").trim();
  if (/^[A-Za-z0-9_]{1,30}$/.test(str) && !["home", "explore", "search", "handle"].includes(str.toLowerCase())) {
    return str;
  }
  return null;
}

export function extractHandle(source: Pick<SourceRow, "id" | "config" | "name">): string | null {
  if (typeof source.config?.handle === "string") {
    const cleaned = cleanHandle(source.config.handle);
    if (cleaned) return cleaned;
  }
  const query = String(source.config?.query ?? "");
  const m = /from:@?([A-Za-z0-9_]{1,30})/i.exec(query);
  if (m && m[1]) {
    const cleaned = cleanHandle(m[1]);
    if (cleaned) return cleaned;
  }
  if (typeof source.config?.url === "string") {
    const cleaned = cleanHandle(source.config.url);
    if (cleaned) return cleaned;
  }
  if (source.id.startsWith("x-")) {
    const cleaned = cleanHandle(source.id.replace(/^x-/, ""));
    if (cleaned) return cleaned;
  }
  return cleanHandle(source.id);
}

/** Decodes the publication timestamp from a Twitter 64-bit snowflake ID. */
export function tweetIdToDate(idStr: string): Date | null {
  try {
    if (!/^\d{15,22}$/.test(idStr)) return null;
    const id = BigInt(idStr);
    const epoch = 1288834974657n; // Twitter Snowflake epoch (2010-11-04T01:42:54.657Z)
    const timeMs = Number((id >> 22n) + epoch);
    const now = Date.now();
    if (timeMs > 1293840000000 && timeMs < now + 86400000) {
      return new Date(timeMs);
    }
  } catch {
    // fallback
  }
  return null;
}

/**
 * Safely unescapes JS/Seroval string literals from Twitter SSR script blocks into standard JSON.
 * Twitter SSR emits JS escapes like \x3C, \x3E, \', which standard JSON.parse rejects.
 */
export function sanitizeJsStringLiteral(raw: string): string {
  return raw
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => `\\u00${hex}`)
    .replace(/\\'/g, "'");
}

export interface ParseXSsrResult {
  timelineFound: boolean;
  candidates: Candidate[];
}

export function parseXSsrTimeline(html: string, handle: string, sourceName?: string): ParseXSsrResult {
  const candidates: Candidate[] = [];
  const seenIds = new Set<string>();
  let timelineFound = false;

  // Match SSR JSON value chunks in Twitter SSR payload
  const jsonChunks = Array.from(html.matchAll(/value:"(\{\\"data\\":.*?})"\s*[,}]/gs));

  for (const chunk of jsonChunks) {
    try {
      const sanitized = sanitizeJsStringLiteral(chunk[1]!);
      const unescaped = JSON.parse(`"${sanitized}"`);
      const data = JSON.parse(unescaped) as Record<string, any>;
      const timeline = data?.data?.user_result_by_screen_name?.result?.profile_user_originals_timeline?.timeline ||
                       data?.data?.user_result_by_screen_name?.result?.timeline_response?.timeline;
      if (!timeline) continue;
      timelineFound = true;

      for (const inst of timeline.instructions || []) {
        // Skip pinned tweet instruction to keep chronological order clean
        if (inst.__typename === "TimelinePinEntry") continue;

        for (const e of inst.entries || []) {
          let tweet = e.content?.content?.tweet_results?.result ||
                      e.content?.itemContent?.tweet_results?.result;
          if (!tweet) continue;
          if (tweet.tweet) tweet = tweet.tweet;

          // Skip retweets
          if (tweet.legacy?.retweeted_status_result || tweet.retweeted_status_result) continue;

          // Skip replies by default (matching standard from:handle -filter:replies query semantics)
          if (tweet.legacy?.in_reply_to_status_id_str) continue;

          const tweetId = String(tweet.rest_id ?? "");
          if (!tweetId || seenIds.has(tweetId)) continue;

          const author = String(tweet.core?.user_results?.result?.core?.screen_name || handle);
          const authorName = String(tweet.core?.user_results?.result?.core?.name || sourceName || author);
          const rawAvatar = tweet.core?.user_results?.result?.avatar?.image_url;
          const avatarUrl = typeof rawAvatar === "string" && rawAvatar.startsWith("https://") ? avatar(rawAvatar) : null;

          const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
          const rawText = noteText || tweet.details?.full_text || tweet.legacy?.full_text || "";
          const text = cleanTweetText(String(rawText).trim());

          let tweetDate: Date | null = null;
          if (tweet.details?.created_at_ms) {
            const ms = Number(tweet.details.created_at_ms);
            if (!Number.isNaN(ms) && ms > 0) tweetDate = new Date(ms);
          }
          if (!tweetDate && tweet.legacy?.created_at) {
            const d = new Date(tweet.legacy.created_at);
            if (!Number.isNaN(d.getTime())) tweetDate = d;
          }
          if (!tweetDate) {
            tweetDate = tweetIdToDate(tweetId);
          }
          const publishedAt = (tweetDate && !Number.isNaN(tweetDate.getTime())) ? tweetDate : new Date();

          // Skip tweets older than 14 days from regular crawl
          if (Date.now() - publishedAt.getTime() > 14 * 86400000) {
            continue;
          }

          const mediaEntities = tweet.media_entities2 || tweet.legacy?.extended_entities?.media || [];
          const media = (mediaEntities as any[])
            .map((m) => {
              const url = m.media_url_https || m.media_url;
              if (typeof url !== "string" || !url.startsWith("https://")) return null;
              return {
                kind: m.type === "video" || m.type === "animated_gif" ? ("video" as const) : ("image" as const),
                url,
                width: typeof m.original_info?.width === "number" ? m.original_info.width : null,
                height: typeof m.original_info?.height === "number" ? m.original_info.height : null,
                poster: url,
              };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null);

          if (!text && media.length === 0) continue;

          const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
          const title = firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine || `${authorName} 於 X 發布動態`;
          const tweetUrl = `https://x.com/${author}/status/${tweetId}`;

          seenIds.add(tweetId);
          candidates.push({
            url: tweetUrl,
            identityKey: `x:${tweetId}`,
            title,
            author,
            language: tweet.legacy?.lang ?? null,
            publishedAt,
            bodyText: text,
            bodyStatus: linksXArticle(text) ? "pending" : "ok",
            xPost: {
              tweetId,
              authorName,
              handle: author,
              avatarUrl,
              text,
              lang: tweet.legacy?.lang ?? null,
              replyTo: tweet.legacy?.in_reply_to_status_id_str ?? null,
              media,
              quoted: null,
            },
            media,
            raw: {
              favorite: tweet.counts?.favorite_count ?? tweet.legacy?.favorite_count ?? null,
              retweet: tweet.counts?.retweet_count ?? tweet.legacy?.retweet_count ?? null,
              views: tweet.views?.count ? Number(tweet.views.count) : null,
            },
          });
        }
      }
    } catch {
      // Continue to next chunk
    }
  }

  return { timelineFound, candidates };
}

/** Crawls recent tweets from an X profile using 2md.aiurl.tw without requiring paid API keys. */
export async function fetchXVia2md(source: SourceRow): Promise<XFetch> {
  const handle = extractHandle(source);
  if (!handle) throw new FetchError(`無法從信源 ${source.id} 判斷 X / Twitter 帳號 handle`);

  let candidates: Candidate[] = [];
  let timelineFound = false;

  // 1. Primary strategy: Fetch HTML via 2md with X-Respond-With: html to extract complete Twitter SSR GraphQL state
  try {
    const html = await readPageAsHtml(`https://x.com/${handle}`);
    const parsed = parseXSsrTimeline(html, handle, source.name);
    timelineFound = parsed.timelineFound;
    candidates = parsed.candidates;
  } catch (err) {
    // If HTML fetch failed, fall back to markdown reader
  }

  // 2. Fallback strategy: Only if SSR extraction failed to find any timeline structure
  if (!timelineFound && candidates.length === 0) {
    const page = await readPageAsMarkdown(`https://x.com/${handle}`);
    // Strict status link regex for this handle only (avoids attributing other users' reply/quote status IDs)
    const statusRegex = new RegExp(`(?:https?:\\/\\/x\\.com\\/${handle}\\/status\\/|href="\\/${handle}\\/status\\/)(\\d+)`, "gi");
    const allMatches = Array.from(page.raw.matchAll(statusRegex));
    const tweetIds: string[] = [];
    for (const m of allMatches) {
      const id = m[1]!;
      if (!tweetIds.includes(id)) {
        tweetIds.push(id);
      }
    }

    const blocks = page.markdown.split(/\n(?=\*\s+)/);

    for (const block of blocks) {
      if (!block.trimStart().startsWith("*")) continue;

      const trimmed = block.trim();
      if (/^\*\s*Pinned\b/i.test(trimmed) || trimmed.includes("Pinned\n") || trimmed.includes("Pinned\r\n")) {
        continue;
      }

      const statusMatch = new RegExp(`https?:\\/\\/x\\.com\\/${handle}\\/status\\/(\\d+)`, "i").exec(block) ||
        new RegExp(`\\/${handle}\\/status\\/(\\d+)`, "i").exec(block) ||
        new RegExp(`(?:amplify_video_thumb|media)\\/(\\d{15,22})`, "i").exec(block);

      const matchedId = statusMatch ? statusMatch[1]! : null;
      if (matchedId) {
        const idx = tweetIds.indexOf(matchedId);
        if (idx !== -1) tweetIds.splice(idx, 1);
      }
      const tweetId = matchedId ?? null;
      if (!tweetId) continue;

      let text = block
        .replace(/\*?\s*\[!\[Image.*?\]\(.*?\)\]\(.*?\)/g, "")
        .replace(/\[!\[Image.*?\]\(.*?\)\]/g, "")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/\[(?:Log in|Sign up|Continue with.*?|Video \d+)\]\(.*?\)/gi, "")
        .replace(new RegExp(`\\[.*?\\]\\(https://x\\.com/${handle}\\)`, "gi"), "")
        .replace(new RegExp(`\\[.*?\\]\\(https://x\\.com/${handle}/status/\\d+\\)`, "gi"), "")
        .replace(new RegExp(`\\[.*?\\]\\(https://x\\.com/hashtag/.*?\\)`, "gi"), "")
        .trim();

      text = cleanTweetText(text.replace(/^[^\n]*?@[A-Za-z0-9_]+\s*(?:\[\w+\])?\s*/i, "").trim());

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

      if (candidates.some((c) => c.identityKey === `x:${tweetId}`)) continue;

      const tweetDate = tweetIdToDate(tweetId);
      const publishedAt = tweetDate ?? new Date();

      // Skip tweets older than 14 days from regular crawl
      if (tweetDate && Date.now() - tweetDate.getTime() > 14 * 86400000) {
        continue;
      }

      const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
      const title = firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine || `${source.name || handle} 於 X 發布動態`;
      const tweetUrl = `https://x.com/${handle}/status/${tweetId}`;

      candidates.push({
        url: tweetUrl,
        identityKey: `x:${tweetId}`,
        title,
        author: handle,
        language: null,
        publishedAt,
        bodyText: text,
        bodyStatus: linksXArticle(text) ? "pending" : "ok",
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

  }

  // Sort candidates newest first
  candidates.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));

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
const SHARDABLE = /^from:@?([A-Za-z0-9_]{1,15}) -filter:replies$/i;
/** The same test in SQL, for the schedulers. */
export const SHARDABLE_SQL = "^from:@?[A-Za-z0-9_]{1,15} -filter:replies$";
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
