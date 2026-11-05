// Share images (1200×630 PNG) for pages, items, reports, topics and events. Only public content
// gets a card; anything else is a real 404.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { loadItemShare } from "@aihot/backend/publication/og";
import { loadReport, type ReportKind } from "@aihot/backend/publication/reports";
import { loadTopic } from "@aihot/backend/publication/topics";
import { loadStoryDetail, resolveStory } from "@aihot/backend/publication/stories";
import { SITE, withSubject } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { config } from "@aihot/backend/config";
import { ogEtag, renderOg, type OgCard } from "../og/render.ts";
import { posterEtag, renderPoster, type Poster } from "../og/poster.ts";

const S = SITE.subject;
const PAGES: Record<string, OgCard> = {
  site: { kicker: SITE.name, title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: `全部${withSubject("動態")}`, title: "所有信源的最新動態，一站看完", subtitle: "按時間彙整各信源的最新動態，可按類別與標籤篩選。" },
  hot: { kicker: "熱門排行", title: "過去 48 小時，大家在討論什麼", subtitle: "熱度指數、趨勢與公開來源。", accent: "hot" },
  daily: { kicker: withSubject("日報"), title: `每天 8 點，一份讀得完的${withSubject("日報")}`, subtitle: `前一天值得關注的${S}動態。` },
  weekly: { kicker: withSubject("週報"), title: "一週大事，一次看清", subtitle: "本週主線、重要發布與值得回看的討論。" },
  monthly: { kicker: withSubject("月報"), title: "一個月的變化", subtitle: "月度主線與關鍵事件回顧。" },
  topics: { kicker: "主題", title: "長期追蹤的方向", subtitle: "公司與機構、專題方向、內容形式。" },
  leaderboard: { kicker: "AI 模型排行榜", title: "多家公開評測的共識排名", subtitle: "綜合、程式設計、推理、知識、專業辦公；缺測不補零，價格不影響排名。" },
  "codex-reset": { kicker: "Tibo 重置監控", title: "Codex 額度重置時間", subtitle: "推算的台北時間區間、適用範圍與 Tibo 原話。", accent: "amber" },
  about: { kicker: "關於", title: `關於 ${SITE.name}`, subtitle: SITE.description },
  terms: { kicker: "使用規則", title: `${SITE.name} 使用規則`, subtitle: "網站、API、RSS 與 MCP 的使用範圍。" },
  privacy: { kicker: "隱私說明", title: `${SITE.name} 隱私說明`, subtitle: "存取紀錄、瀏覽器本機資料與意見回饋的處理方式。" },
  changelog: { kicker: "更新日誌", title: `${SITE.name} 更新日誌`, subtitle: "功能更新、最佳化、公告與下架紀錄。" },
  feedback: { kicker: "意見回饋", title: "告訴我們哪些地方可以更好", subtitle: "內容、功能、接入，或來源方的更正與下架請求。" },
  agent: { kicker: "Agent 接入", title: `讓 Agent 直接使用 ${SITE.name}`, subtitle: "MCP、RSS 與 REST API v1，匿名唯讀。" },
  "agent-tw": { kicker: "Agent 接入", title: `讓 Agent 直接使用 ${SITE.name}`, subtitle: "MCP、RSS 與 REST API v1，匿名唯讀。" },
};

/**
 * Article share images carry the title and summary, so shared caches keep them for an hour at most:
 * after a withdrawal or a correction they are gone from any cache within the hour.
 */
export const ARTICLE_IMAGE_CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600";
const ARTICLE_IMAGE_ORIGIN_SECONDS = "300";

async function send(req: FastifyRequest, reply: FastifyReply, card: OgCard, maxAge: number, cacheControl = `public, max-age=${maxAge}, s-maxage=${maxAge * 7}, stale-while-revalidate=86400`) {
  const tag = `"og-${ogEtag(card)}"`;
  reply.header("ETag", tag).header("Cache-Control", cacheControl);
  if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
  return reply.type("image/png").send((await renderOg(card)).png);
}

function notFound(reply: FastifyReply) {
  return reply.code(404).header("Cache-Control", "public, max-age=300").type("text/plain; charset=utf-8").send("Not found");
}

const REPORT_NAMES: Record<ReportKind, string> = { daily: withSubject("日报"), weekly: withSubject("周报"), monthly: withSubject("月报") };

export function registerOg(app: FastifyInstance) {
  app.get("/og/site.png", (req, reply) => send(req, reply, PAGES.site!, 86400));

  app.get("/og/pages/:file", async (req, reply) => {
    const name = (req.params as { file: string }).file.replace(/\.png$/, "");
    const card = PAGES[name];
    if ((name === "leaderboard" && !FEATURES.leaderboard) || (name === "codex-reset" && !FEATURES.codexResetMonitor)) return notFound(reply);
    if (!card || !(req.params as { file: string }).file.endsWith(".png")) return notFound(reply);
    return send(req, reply, card, 86400);
  });

  app.get("/og/items/:file", async (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const d = await loadItemShare(file.slice(0, -4));
    if (!d) return notFound(reply);
    reply.header("X-Accel-Expires", ARTICLE_IMAGE_ORIGIN_SECONDS);
    return send(req, reply, {
      kicker: d.category ? CATEGORY_LABELS[d.category] : withSubject("动态"),
      title: d.title,
      subtitle: d.summary,
      meta: `${d.source.name.replace(/（[^）]*）\s*$/, "")} · ${beijingDate(d.timelineAt)}`,
      badge: d.selected && d.score !== null ? { value: String(Math.round(d.score)), label: "精选评分" } : null,
    }, 3600, ARTICLE_IMAGE_CACHE);
  });

  // Phone share poster for an article (1080×1440), generated on first request and cached by content.
  app.get("/og/posters/:file", async (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const d = await loadItemShare(file.slice(0, -4));
    if (!d) return notFound(reply);
    const poster: Poster = {
      url: `${config.siteUrl}/items/${d.id}`,
      kicker: d.category ? CATEGORY_LABELS[d.category] : withSubject("动态"),
      title: d.title,
      summary: d.summary,
      source: d.source.name.replace(/（[^）]*）\s*$/, ""),
      date: beijingDate(d.timelineAt),
      score: d.selected ? d.score : null,
    };
    const tag = `"poster-${posterEtag(poster)}"`;
    reply.header("ETag", tag).header("Cache-Control", ARTICLE_IMAGE_CACHE).header("X-Accel-Expires", ARTICLE_IMAGE_ORIGIN_SECONDS);
    if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
    return reply.type("image/png").send((await renderPoster(poster)).png);
  });

  app.get("/og/reports/:kind/:file", async (req, reply) => {
    const { kind, file } = req.params as { kind: string; file: string };
    if (!["daily", "weekly", "monthly"].includes(kind) || !file.endsWith(".png")) return notFound(reply);
    const r = await loadReport(kind as ReportKind, file.slice(0, -4));
    if (!r) return notFound(reply);
    return send(req, reply, {
      kicker: `${REPORT_NAMES[r.kind]} · ${r.key}`,
      title: r.lead?.title ?? r.title,
      subtitle: r.lead?.leadParagraph ?? r.overview,
      meta: `${r.stories.length} 則核心新聞 · 約 ${r.readingMinutes} 分鐘讀完`,
    }, 86400);
  });

  app.get("/og/topics/:file", async (req, reply) => {
    const file = (req.params as { file: string }).file;
    const t = file.endsWith(".png") ? await loadTopic(file.slice(0, -4)) : null;
    if (!t) return notFound(reply);
    return send(req, reply, { kicker: "主题", title: t.name, subtitle: t.definition }, 86400);
  });

  app.get("/og/stories/:file", async (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const found = await resolveStory(file.slice(0, -4));
    if (found.kind !== "found") return notFound(reply);
    const s = await loadStoryDetail(found.storyId);
    if (!s) return notFound(reply);
    return send(req, reply, {
      kicker: s.whyHot.rank ? `熱門第 ${s.whyHot.rank} · 事件` : "事件",
      title: s.title,
      subtitle: s.latest ?? s.digest,
      meta: `${s.sourceCount} 个来源 · ${s.reportCount} 篇报道`,
      accent: s.whyHot.rank ? "hot" : "teal",
    }, 3600);
  });
}
