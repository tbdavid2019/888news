import { SITE } from "@aihot/industry/site";
import { useEffect, useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import {
  getMonitorPlatform,
  MONITOR_PLATFORMS,
  parseMonitorPlatform,
  type CodexResetDay,
  type CodexResetEvent,
  type CodexResetSitePage,
  type MonitorPlatformId,
  type MonitorPlatformMeta,
} from "@aihot/contracts/monitor";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { PostCard } from "../features/monitor/PostCard";
import { ResetCalendar } from "../features/monitor/ResetCalendar";
import { bjDate, bjTime, dayWord, durationText, monthDay, stamp, typeName, windowText } from "../features/monitor/format";
import { IconChevronDown, IconChevronRight } from "../components/icons";
import { useEntrance } from "../lib/hydration";

type LoaderData = CodexResetSitePage & { platform: MonitorPlatformId; serverNow: number };

export async function loader({ request, params }: { request: Request; params: { date?: string } }) {
  const url = new URL(request.url);
  const platform = parseMonitorPlatform(url.searchParams.get("platform"));
  const [data, day] = await Promise.all([
    loadOr404<CodexResetSitePage>(`/api/site/codex-reset?platform=${platform}`, { request, signal: request.signal }),
    params.date ? loadOr404<CodexResetDay>(`/api/site/codex-reset/days/${encodeURIComponent(params.date)}?platform=${platform}`, { request, signal: request.signal }) : null,
  ]);
  return { ...data, ...(day ? { selectedDate: day.date, events: day.events } : {}), platform, serverNow: Date.now() };
}

export function meta() {
  return pageMeta({
    title: "重設監控",
    description: "盯著 OpenAI Codex、Google Antigravity、Anthropic Claude 與 xAI Grok 的官方額度重設公告：什麼時候生效、誰能用上、原話怎麼說。",
    path: "/codex-reset",
    image: "/og/pages/codex-reset.png",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" };
}

const POLL_MS = 60_000;

/** Low-frequency version check while the page is in the foreground. */
function useVersionPolling(version: string, platform: MonitorPlatformId) {
  const revalidator = useRevalidator();
  useEffect(() => {
    let stopped = false;
    let request: AbortController | null = null;
    const tick = async () => {
      if (document.visibilityState !== "visible" || request) return;
      request = new AbortController();
      try {
        const res = await fetch(`/api/site/codex-reset/version?platform=${platform}`, { cache: "no-store", signal: request.signal });
        if (!res.ok) return;
        const v = (await res.json()) as { version: string };
        if (!stopped && v.version !== version) revalidator.revalidate();
      } catch {
        // offline: try again next tick
      } finally {
        request = null;
      }
    };
    const timer = setInterval(tick, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      request?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [version, platform, revalidator]);
}

function scopeText(e: CodexResetEvent | null | undefined, meta: MonitorPlatformMeta) {
  if (!e) return meta.defaultScope;
  const who = e.presentation?.audienceZh ?? e.presentation?.scopeLabel ?? meta.defaultScope;
  return e.presentation?.productsZh ? `${who} · ${e.presentation.productsZh}` : who;
}

/** The status card: what the team announced and when it should land, beside the official post. */
function Hero({ d, now, meta }: { d: LoaderData; now: number; meta: MonitorPlatformMeta }) {
  const e = d.current;
  const entrance = useEntrance();
  const authorName = d.authorDisplayName ?? meta.authorName;
  const authorHandle = d.authorHandle ?? meta.primaryAuthor;
  const shell = "cr-wash grid items-center gap-5 rounded-sheet border border-line-strong p-4 sm:p-6 lg:grid-cols-2 lg:gap-8 lg:p-8";
  if (!e) {
    const last = d.lastLanded;
    return (
      <section className={shell} style={{ "--tone": last ? "var(--ok-ink)" : "var(--ink-4)" } as React.CSSProperties}>
        <div className="min-w-0">
          <p className={`inline-flex items-center gap-2 text-[13px] font-medium ${last ? "text-ok-ink" : "text-ink-4"}`}>
            <span className="cr-dot" aria-hidden="true" />
            暫無新的待生效預告
          </p>
          <h2 className="mt-3 text-[20px] font-[650] leading-[1.25] text-ink sm:text-[24px]">
            {d.stats.lastResetDate ? `上一次額度重設：${monthDay(d.stats.lastResetDate)}確認` : "暫無額度重設記錄"}
          </h2>
          <p className="mt-2.5 text-[13px] leading-[1.7] text-ink-3">適用範圍：{scopeText(last, meta)}</p>
          <p className="mt-2 text-[13px] leading-[1.75] text-ink-4">{meta.disclaimer}</p>
          {d.outage && (
            <p className="mt-4 border-t border-line pt-4 text-[13px] leading-[1.75] text-ink-3">
              線索：{dayWord(bjDate(d.outage.publishedAt!), d.today)} {bjTime(d.outage.publishedAt!)} {authorName} 確認 {meta.product} 故障
              {d.outage.recoveredAt ? `，${bjTime(d.outage.recoveredAt)} 恢復` : ""}。故障不等於重設。
            </p>
          )}
        </div>
        {last?.posts[0] && (
          <div className="min-w-0">
            <PostCard
              avatar={d.authorAvatar}
              authorName={authorName}
              authorHandle={authorHandle}
              stage={`${last.posts[0].stage}原帖`}
              post={{ id: last.posts[0].id, author: last.posts[0].author, publishedAt: last.posts[0].publishedAt, translation: last.posts[0].fullText ?? last.posts[0].text, original: last.posts[0].fullOriginalText ?? last.posts[0].originalText, context: last.posts[0].context, url: last.posts[0].url }}
            />
          </div>
        )}
      </section>
    );
  }
  const status = e.presentation?.status ?? "announced";
  const window = e.estimate ?? e.schedule;
  const through = window?.through ? Date.parse(window.through) : null;
  const from = window?.from ? Date.parse(window.from) : null;
  const credit = e.type === "reset_credit";
  const headline = status === "in_progress" ? (credit ? "重設卡正在發放" : "額度重設正在進行") : credit ? "等待重設卡到賬" : "等待額度重設生效";
  let timing: string | null = null;
  if (status === "expired_unconfirmed" && through) timing = `已比預計晚 ${durationText(now - through)}，仍在等待確認`;
  else if (status === "announced" && from && now < from) timing = `距預計時段還有 ${durationText(from - now)}`;
  else if (status === "announced" && through && now < through) timing = "正處在預計時間段內";
  else if (status === "in_progress" && e.presentation?.reportedAt) timing = `${authorName} ${stamp(e.presentation.reportedAt)} 表示正在進行`;
  const outage = d.outage && d.outage.resetEventId === e.id ? d.outage : null;
  const post = e.posts[0];
  return (
    <section
      className={`${shell} ${entrance ? "animate-fade-up" : ""}`}
      style={{ "--tone": status === "expired_unconfirmed" ? "var(--hot)" : "var(--amber-ink)" } as React.CSSProperties}
    >
      <div className="min-w-0">
        <p className={`inline-flex items-center gap-2 text-[13px] font-medium ${status === "expired_unconfirmed" ? "text-hot" : "text-amber-ink"}`}>
          <span className="cr-dot cr-dot-live" aria-hidden="true" />
          {typeName(e.type)} · {authorName} 已宣佈
        </p>
        <h2 className="mt-3 text-[20px] font-[650] leading-[1.25] text-ink sm:text-[24px]">{headline}</h2>
        {window?.from && (
          <p className="num mt-4 text-[24px] font-[650] leading-[1.3] tracking-[-0.01em] text-amber-ink lg:text-[clamp(24px,2.6vw,32px)]">
            預計 {windowText(window.from, window.through, d.today).replace("–", " – ")}
          </p>
        )}
        {(timing || e.estimate?.reason) && (
          <p className="mt-2 text-[13px] leading-[1.75] text-ink-4">
            {timing}
            {timing && e.estimate?.reason ? " · " : ""}
            {e.estimate?.reason}
          </p>
        )}
        <ul className="mt-4 grid gap-2 border-t border-line pt-4 text-[13px] leading-[1.75] text-ink-3">
          <li>適用範圍：{scopeText(e, meta)}</li>
          {outage?.publishedAt && (
            <li>
              起因：{dayWord(bjDate(outage.publishedAt), d.today)} {bjTime(outage.publishedAt)} {authorName} 確認 {meta.product} 故障{outage.recoveredAt ? `，${bjTime(outage.recoveredAt)} 恢復` : ""}
            </li>
          )}
        </ul>
        <p className="mt-4 text-[13px] leading-[1.75] text-ink-3">
          {credit ? `重設卡到賬後由你自己決定何時使用。卡片餘額以 ${meta.product} 內顯示為準。` : `剩餘額度可以放心用，生效後會恢復滿額。以你 ${meta.product} 裡顯示的用量為準。`}
        </p>
      </div>
      {post && (
        <div className="min-w-0">
          <PostCard
            avatar={d.authorAvatar}
            authorName={authorName}
            authorHandle={authorHandle}
            stage={`${post.stage}原帖`}
            post={{ id: post.id, author: post.author, publishedAt: post.publishedAt, translation: post.fullText ?? post.text, original: post.fullOriginalText ?? post.originalText, context: post.context, url: post.url }}
          />
        </div>
      )}
    </section>
  );
}

function StatsStrip({ d }: { d: LoaderData }) {
  const showCredits = d.platform === "codex" || d.stats.credits90 > 0;
  const items = [
    { label: "近 90 天額度重設", value: `${d.stats.resets90} 次` },
    ...(showCredits ? [{ label: "近 90 天發重設卡", value: `${d.stats.credits90} 次` }] : []),
    { label: "通常間隔", value: d.stats.medianIntervalDays !== null ? `${d.stats.medianIntervalDays} 天` : "—" },
    { label: "上次額度重設", value: d.stats.lastResetDate ? monthDay(d.stats.lastResetDate) : "—" },
  ];
  return (
    <section
      className={`mt-4 grid grid-cols-1 overflow-hidden rounded-card border border-line-strong bg-surface sm:divide-x sm:divide-line ${
        showCredits ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
      }`}
      aria-label="近 90 天統計"
    >
      {items.map((item) => (
        <div key={item.label} className="border-b border-line px-5 py-4 last:border-b-0 lg:border-b-0">
          <p className="text-[12px] text-ink-4">{item.label}</p>
          <p className="num mt-1.5 text-[22px] font-[650] leading-tight text-ink">{item.value}</p>
        </div>
      ))}
    </section>
  );
}

/** Tibo's usual hours: 16:30–21:30 Pacific, i.e. 07:30–12:30 Beijing the next morning. */
const USUAL_FROM = 7 * 60 + 30;
const USUAL_TO = 12 * 60 + 30;
const inUsual = (m: number) => m >= USUAL_FROM && m <= USUAL_TO;

const MONITOR_WORDS = { healthy: "監控正常", delayed: "檢查有延遲", attention: "監控需要處理", unknown: "監控狀態未知" } as const;
const MONITOR_DOT = { healthy: "bg-ok-ink", delayed: "bg-amber-ink", attention: "bg-amber-ink", unknown: "bg-ink-4" } as const;

export default function CodexResetPage() {
  const d = useLoaderData<typeof loader>();
  const meta = getMonitorPlatform(d.platform);
  useVersionPolling(d.version, d.platform);
  const m = d.monitor;
  return (
    <div className="pb-8">
      <header className="flex flex-col gap-1 pb-4 pt-5 lg:flex-row lg:items-end lg:justify-between lg:pt-1">
        <div>
          <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">重設監控</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{meta.subtitle}</p>
        </div>
        <p className="text-[12px] text-ink-4">全部為台北時間 · GMT+8</p>
      </header>

      <nav className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-line-strong bg-bg-sunk p-1" aria-label="監控平台切換">
        {MONITOR_PLATFORMS.map((p) => {
          const active = p.id === d.platform;
          const to = p.id === "codex" ? "/resets" : `/resets?platform=${p.id}`;
          return (
            <Link
              key={p.id}
              to={to}
              prefetch="intent"
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                active ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3 hover:text-ink"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>

      <LiveMonitor d={d} meta={meta} />

      <details className="disclosure group mt-8 border-t border-line">
        <summary className="flex items-center justify-between gap-3 py-[18px] text-[13px] text-ink-3 transition-colors hover:text-ink">
          <span className="inline-flex items-center gap-1.5">
            <IconChevronRight size={13} className="text-ink-4 transition-transform duration-200 group-open:rotate-90" />
            時間是怎麼推算的？
          </span>
          <span className="text-[12px] text-ink-4">來源與規則</span>
        </summary>
        <div className="grid gap-x-8 gap-y-[18px] pb-6 pt-1.5 text-[12px] leading-[1.9] text-ink-4 md:grid-cols-2">
          <p><strong className="font-semibold text-ink-3">有原話就按原話。</strong>官方人員寫了時間（如 “6pm PST”“next hour”“end of day”），按太平洋時間換算成台北時間，並多留一兩個小時——確認帖通常比預告的時間晚一點。只寫了日期的，按以往習慣落在當天太平洋時間傍晚。</p>
          <p><strong className="font-semibold text-ink-3">沒寫時間就按習慣。</strong>{d.platform === "codex" ? "Tibo 多在太平洋時間 16:30–21:30 按下重設按鈕，也就是台北時間第二天早上 07:30–12:30。" : "工程團隊通常會在發布公告後數小時內完成全域下發。"}{d.platform === "codex" && d.confirmMinutes.length ? `近 ${d.confirmMinutes.length} 次確認中有 ${d.confirmMinutes.filter(inUsual).length} 次在這個時段。` : ""}推算只是參考，以官方確認和你 {meta.product} 裡的用量為準。</p>
          <p><strong className="font-semibold text-ink-3">已生效、應已生效、等待中。</strong>官方發帖確認才算“已生效”；預計時間過去幾個小時仍沒有確認帖，顯示“應已生效”。重設卡 / 免費手動重設與全域額度重設分開記錄。</p>
          <p><strong className="font-semibold text-ink-3">持續追蹤官方公開貼文。</strong>平時每 5 分鐘檢查一次，確認故障或宣佈重設後改為每 3 分鐘。只有明確的重設或發卡訊息才會推播至通知頻道。個人額度與重設資格請在 {meta.product} 內檢視。</p>
        </div>
      </details>

      <footer className="flex flex-col gap-2 border-t border-line py-4 text-[12px] text-ink-4 sm:flex-row sm:items-start sm:justify-between">
        {m ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span className={`size-1.5 rounded-full ${MONITOR_DOT[m.status]}`} />
              {MONITOR_WORDS[m.status]} · 最近檢查 <span className="num">{stamp(m.lastVerifiedAt)}</span>
              <IconChevronDown size={13} className="text-ink-4 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="num mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 pl-4 text-[12px] text-ink-4">
              <dt>最近嘗試</dt><dd>{stamp(m.lastAttemptAt)}</dd>
              <dt>最近採集</dt><dd>{stamp(m.lastCollectedAt)}</dd>
              <dt>最近完整核驗</dt><dd>{stamp(m.lastVerifiedAt)}</dd>
              {m.pendingCount > 0 && <><dt>待處理帖子</dt><dd>{m.pendingCount}</dd></>}
              {m.heldWindowCount > 0 && <><dt>待核實視窗</dt><dd>{m.heldWindowCount}</dd></>}
            </dl>
          </details>
        ) : (
          <span>監控狀態暫不可用</span>
        )}
        <span>{SITE.name} 整理 · {meta.nonOfficialNote}</span>
      </footer>
    </div>
  );
}

/** Only the changing status/calendar need the foreground clock; archive statistics stay still. */
function LiveMonitor({ d, meta }: { d: LoaderData; meta: MonitorPlatformMeta }) {
  const [now, setNow] = useState(d.serverNow);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    update();
    const t = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", update);
    };
  }, [d.version, d.platform]);
  return <>
    <Hero d={d} now={now} meta={meta} />
    <StatsStrip d={d} />
    <ResetCalendar
      key={`${d.platform}-${d.selectedDate}`}
      platform={d.platform}
      authorName={d.authorDisplayName ?? meta.authorName}
      authorHandle={d.authorHandle ?? meta.primaryAuthor}
      productName={meta.product}
      selectedDate={d.selectedDate}
      version={d.version}
      marks={d.calendar}
      events={d.events}
      today={d.today}
      historyFrom={d.historyFrom}
      now={now}
      avatar={d.authorAvatar}
    />
  </>;
}
