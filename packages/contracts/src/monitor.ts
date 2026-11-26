// Reset monitor DTOs: the public v1 snapshot (GET /api/v1/codex-resets) and the page data
// the site builds from the same snapshot across supported AI platforms.

export type MonitorPlatformId = "codex" | "antigravity" | "claude" | "grok";

export interface MonitorPlatformMeta {
  id: MonitorPlatformId;
  label: string;
  vendor: string;
  product: string;
  authorName: string;
  primaryAuthor: string;
  authors: readonly string[];
  subtitle: string;
  defaultScope: string;
  disclaimer: string;
  nonOfficialNote: string;
}

export const MONITOR_PLATFORMS: readonly MonitorPlatformMeta[] = [
  {
    id: "codex",
    label: "Codex",
    vendor: "OpenAI",
    product: "Codex",
    authorName: "Tibo",
    primaryAuthor: "thsottiaux",
    authors: ["thsottiaux"],
    subtitle: "盯著 OpenAI 的 Tibo 和 Andrew 公佈的 Codex 額度重設和重設卡發放：什麼時候生效、誰能用上、原話怎麼說",
    defaultScope: "Codex 與 ChatGPT 訂閱使用者",
    disclaimer: "確認帖時間不代表精確到賬時間。不預測尚未宣佈的下一次重設。Tibo 宣佈後，這裡會第一時間更新預計時間與原帖。",
    nonOfficialNote: "非 OpenAI 官方頁面",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    vendor: "Google",
    product: "Antigravity",
    authorName: "Varun",
    primaryAuthor: "_mohansolo",
    authors: ["_mohansolo", "kevinhou22"],
    subtitle: "盯著 Google 的 Varun 公佈的 Antigravity 額度重設：什麼時候生效、誰能用上、原話怎麼說",
    defaultScope: "Antigravity 上的所有使用者 · Gemini",
    disclaimer: "確認帖時間不代表精確到賬時間。不預測尚未宣佈的下一次重設。Varun 宣佈後，這裡會第一時間更新預計時間與原帖。",
    nonOfficialNote: "非 Google 官方頁面",
  },
  {
    id: "claude",
    label: "Claude",
    vendor: "Anthropic",
    product: "Claude / Claude Code",
    authorName: "ClaudeDevs",
    primaryAuthor: "ClaudeDevs",
    authors: ["ClaudeDevs"],
    subtitle: "盯著 Anthropic 官方 (@ClaudeDevs) 公佈的 Claude / Claude Code 額度重設與免費重設資格：什麼時候生效、誰能用上、原話怎麼說",
    defaultScope: "Claude Pro / Max / Team 與 Claude Code 使用者",
    disclaimer: "確認帖時間不代表精確到賬時間。不預測尚未宣佈的下一次重設。ClaudeDevs 宣佈後，這裡會第一時間更新預計時間與原帖。",
    nonOfficialNote: "非 Anthropic 官方頁面",
  },
  {
    id: "grok",
    label: "Grok Bot",
    vendor: "xAI",
    product: "Grok",
    authorName: "xAI",
    primaryAuthor: "xai",
    authors: ["xai", "grok"],
    subtitle: "盯著 xAI 官方 (@xai / @grok) 公佈的 Grok 額度重設與用量調整：什麼時候生效、誰能用上、原話怎麼說",
    defaultScope: "X Premium / Grok 訂閱使用者",
    disclaimer: "確認帖時間不代表精確到賬時間。不預測尚未宣佈的下一次重設。xAI 宣佈後，這裡會第一時間更新預計時間與原帖。",
    nonOfficialNote: "非 xAI 官方頁面",
  },
] as const;

export const MONITOR_AUTHOR_NAMES: Record<string, string> = {
  thsottiaux: "Tibo",
  _mohansolo: "Varun",
  kevinhou22: "Kevin Hou",
  claudedevs: "ClaudeDevs",
  xai: "xAI",
  grok: "Grok",
};

export function getMonitorAuthorName(handle?: string | null, fallback?: string): string {
  if (!handle) return fallback ?? "Official";
  return MONITOR_AUTHOR_NAMES[handle.toLowerCase()] ?? fallback ?? handle;
}

export function parseMonitorPlatform(raw?: string | null): MonitorPlatformId {
  if (raw === "antigravity" || raw === "claude" || raw === "grok" || raw === "codex") return raw;
  return "codex";
}

export function getMonitorPlatform(id?: string | null): MonitorPlatformMeta {
  const key = parseMonitorPlatform(id);
  return MONITOR_PLATFORMS.find((p) => p.id === key) ?? MONITOR_PLATFORMS[0];
}

export interface CodexResetContextPost {
  id: string;
  author: string;
  relation: "reply" | "quote";
  text: string | null;
  originalText: string;
  url: string;
}

export interface CodexResetPost {
  id: string;
  author?: string;
  publishedAt: string | null;
  stage: string;
  text: string;
  originalText: string;
  fullText: string | null;
  fullOriginalText: string | null;
  context: CodexResetContextPost[];
  url: string;
}

export type CodexPresentationStatus = "announced" | "in_progress" | "confirmed" | "expired_unconfirmed" | "likely_completed";

export interface CodexResetEvent {
  id: string;
  type: "direct_reset" | "reset_credit";
  label: string;
  displayLabel: string;
  presentation: {
    reportedAt?: string | null;
    status: CodexPresentationStatus;
    scopeKnown: boolean;
    scopeLabel: string | null;
    kindExplicit: boolean;
    timeInferred: boolean;
    audienceZh: string | null;
    productsZh: string | null;
  } | null;
  estimate: { from: string | null; through: string | null; basis: string; label: string; reason: string } | null;
  status: "announced" | "confirmed";
  title: string;
  scope: string;
  createdAt: string | null;
  updatedAt: string | null;
  confirmedAt: string | null;
  occurredOn: string | null;
  confirmationBasis: "source_post" | "receipt_review" | null;
  schedule: { precision: string; from: string | null; through: string | null; label: string } | null;
  posts: CodexResetPost[];
  url: string;
}

export interface CodexResetActivity {
  id: string;
  publishedAt: string | null;
  eventIds: string[];
  kind: "event_update" | "related";
  text: string | null;
  originalText: string;
  context: CodexResetContextPost[];
  statusChanged: boolean;
  action: string | null;
  url: string;
}

export interface CodexResetMonitor {
  status: "healthy" | "delayed" | "attention" | "unknown";
  lastAttemptAt: string | null;
  lastCollectedAt: string | null;
  lastVerifiedAt: string | null;
  heldWindowCount: number;
  pendingCount: number;
  reviewCount: number;
}

export interface CodexResetOutage {
  postId: string;
  publishedAt: string | null;
  text: string | null;
  originalText: string;
  recoveredAt: string | null;
  resetEventId: string | null;
  url: string;
}

export interface CodexResetsSnapshot {
  schemaVersion: 1;
  platform?: MonitorPlatformId;
  timezone: "Asia/Shanghai";
  today: string;
  checkedAt: string | null;
  historyFrom: string | null;
  count: number;
  events: CodexResetEvent[];
  activities: CodexResetActivity[];
  monitor: CodexResetMonitor | null;
  outage: CodexResetOutage | null;
}

export interface CodexCalendarMark {
  date: string;
  eventId: string;
  type: "direct_reset" | "reset_credit";
  state: "confirmed" | "likely" | "pending";
  label: string;
}

export interface CodexResetPageData extends CodexResetsSnapshot {
  current: CodexResetEvent | null;
  lastLanded: CodexResetEvent | null;
  /** Primary author's X avatar (proxied), when a post has been collected. */
  authorAvatar: string | null;
  authorHandle?: string;
  authorDisplayName?: string;
  stats: { resets90: number; credits90: number; medianIntervalDays: number | null; lastResetDate: string | null };
  calendar: CodexCalendarMark[];
  /** Beijing minute of day (0–1439) of each source-confirmed direct reset, for the timing chart. */
  confirmMinutes: number[];
  version: string;
}

/** The site sends bodies for the selected calendar day, while v1 keeps the complete snapshot. */
export interface CodexResetSitePage extends Omit<CodexResetPageData, "activities"> { selectedDate: string }
export interface CodexResetDay { date: string; version: string; events: CodexResetEvent[] }
