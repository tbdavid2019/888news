// Operator settings: about-page QR codes (replaced without a release), notification targets
// (switching a group on records enabled_at so older content is never back-filled) and per-service
// request budgets (the circuit breaker paid calls check before sending).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";
import { sha256 } from "../lib/ids.ts";
import { loadContact, type ContactSettings } from "../site/contact.ts";
import { audit } from "./auth.ts";
import { invalidateSlackCache, sendSlackAlert } from "../notify/slack.ts";
import { invalidateDiscordCache, sendDiscordAlert } from "../notify/discord.ts";
import { invalidateTelegramCache, sendTelegramAlert } from "../notify/telegram.ts";
import { getDbLlmConfig, invalidateLlmConfigCache, testModelConnection } from "../providers/llm.ts";
import { requeueAllWaitingArticles } from "../jobs/content.ts";

const MAX_QR_BYTES = 2 * 1024 * 1024;

export async function replaceContactQr(input: { slot: keyof ContactSettings; data: Buffer }, actor: string) {
  if (input.slot !== "wechatQr" && input.slot !== "feishuQr") throw new Error("unknown slot");
  if (input.data.length > MAX_QR_BYTES) throw new Error("二维码图片最大 2MB");
  const meta = await sharp(input.data).metadata().catch(() => null);
  if (!meta || !["png", "jpeg", "webp"].includes(meta.format ?? "")) throw new Error("需要 PNG、JPG 或 WebP 图片");
  if ((meta.width ?? 0) < 120 || (meta.height ?? 0) < 120) throw new Error("图片太小，二维码可能扫不出来");
  const ext = meta.format === "jpeg" ? "jpg" : meta.format!;
  const name = `qr-${input.slot === "wechatQr" ? "wechat" : "feishu"}-${sha256(input.data).slice(0, 8)}.${ext}`;
  const dir = path.join(config.dataDir, "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), input.data);
  const before = await loadContact();
  const next = { ...before, [input.slot]: `/contact/${name}` };
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('contact_qr', ${sql.json(next)}, ${actor})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  await audit(actor, "settings.contact_qr", "settings:contact_qr", null, { [input.slot]: before[input.slot] }, { [input.slot]: next[input.slot] });
  return next;
}

export async function listTargets() {
  return sql`
    SELECT t.key, t.purpose, t.kind, t.enabled, t.enabled_at, t.config_ref, t.note, t.updated_at,
           (SELECT count(*)::int FROM deliveries d WHERE d.target_key = t.key AND d.created_at > now() - interval '7 days') AS deliveries_7d,
           (SELECT max(d.sent_at) FROM deliveries d WHERE d.target_key = t.key) AS last_sent_at
    FROM notify_targets t
    WHERE t.key NOT LIKE 'feishu%'
    ORDER BY t.purpose, t.key`;
}

export async function setTargetEnabled(key: string, enabled: boolean, reason: string, actor: string) {
  if (!reason?.trim()) throw new Error("reason is required");
  const [before] = await sql`SELECT enabled, enabled_at FROM notify_targets WHERE key = ${key}`;
  if (!before) return null;
  const [after] = await sql`
    UPDATE notify_targets SET enabled = ${enabled}, enabled_at = CASE WHEN ${enabled} AND NOT enabled THEN now() ELSE enabled_at END, updated_at = now()
    WHERE key = ${key} RETURNING key, enabled, enabled_at`;
  await audit(actor, enabled ? "notify.enable" : "notify.disable", `notify-target:${key}`, reason, before, after);
  return { ...after, pushEnabledHere: config.feishuContentPushEnabled };
}

export async function listBudgets() {
  return sql`
    SELECT b.service, b.per_minute, b.per_hour, b.per_day, b.note, b.updated_at,
           (SELECT count(*)::int FROM receipt_attempts a WHERE a.service = b.service AND a.origin = 'live' AND a.started_at > now() - interval '1 day') AS used_day,
           (SELECT count(*)::int FROM receipt_attempts a WHERE a.service = b.service AND a.origin = 'live' AND a.started_at > now() - interval '1 hour') AS used_hour
    FROM budgets b
    WHERE b.service NOT IN ('socialdata', 'jina', 'dajiala', 'zhipu', 'mimo', 'dashscope', 'deepseek')
    ORDER BY b.service`;
}

export async function updateBudget(service: string, input: { perMinute: number; perHour: number; perDay: number; reason: string }, actor: string) {
  if (!input.reason?.trim()) throw new Error("reason is required");
  for (const v of [input.perMinute, input.perHour, input.perDay]) if (!Number.isInteger(v) || v < 0) throw new Error("budgets are non-negative integers (0 stops the service)");
  const [before] = await sql`SELECT per_minute, per_hour, per_day FROM budgets WHERE service = ${service}`;
  const [after] = await sql`
    INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES (${service}, ${input.perMinute}, ${input.perHour}, ${input.perDay}, ${input.reason})
    ON CONFLICT (service) DO UPDATE SET per_minute = EXCLUDED.per_minute, per_hour = EXCLUDED.per_hour, per_day = EXCLUDED.per_day, note = EXCLUDED.note, updated_at = now()
    RETURNING service, per_minute, per_hour, per_day`;
  await audit(actor, "budget.update", `budget:${service}`, input.reason, before ?? null, after);
  return after;
}

export interface WebhookChannelInfo {
  configured: boolean;
  source: "env" | "db" | "none";
  valueMasked: string | null;
  extraMasked?: string | null;
}

export interface WebhooksSettings {
  slack: WebhookChannelInfo;
  discord: WebhookChannelInfo;
  telegram: WebhookChannelInfo;
}

export async function getWebhookSettings(): Promise<WebhooksSettings> {
  let db: Record<string, string> = {};
  try {
    const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'webhook_channels'`;
    if (row?.value) db = row.value;
  } catch {}

  const slackUrl =
    db.slackWebhookUrl === "" || db.slackWebhookUrl === "disabled"
      ? null
      : db.slackWebhookUrl || credential("integrations", "SLACK_WEBHOOK_URL") || process.env.SLACK_WEBHOOK_URL || null;
  const discordUrl =
    db.discordWebhookUrl === "" || db.discordWebhookUrl === "disabled"
      ? null
      : db.discordWebhookUrl || credential("integrations", "DISCORD_WEBHOOK_URL") || process.env.DISCORD_WEBHOOK_URL || null;
  const tgToken =
    db.telegramBotToken === "" || db.telegramBotToken === "disabled"
      ? null
      : db.telegramBotToken || credential("integrations", "TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN || null;
  const tgChatId =
    db.telegramChatId === "" || db.telegramChatId === "disabled"
      ? null
      : db.telegramChatId || credential("integrations", "TELEGRAM_CHAT_ID") || process.env.TELEGRAM_CHAT_ID || null;

  const mask = (s: string | null, keep = 6) => {
    if (!s) return null;
    if (s.length <= keep * 2) return `${s.slice(0, 3)}***${s.slice(-3)}`;
    return `${s.slice(0, keep)}...${s.slice(-keep)}`;
  };

  return {
    slack: {
      configured: Boolean(slackUrl),
      source: db.slackWebhookUrl ? "db" : slackUrl ? "env" : "none",
      valueMasked: mask(slackUrl, 18),
    },
    discord: {
      configured: Boolean(discordUrl),
      source: db.discordWebhookUrl ? "db" : discordUrl ? "env" : "none",
      valueMasked: mask(discordUrl, 22),
    },
    telegram: {
      configured: Boolean(tgToken && tgChatId),
      source: db.telegramBotToken ? "db" : tgToken ? "env" : "none",
      valueMasked: mask(tgToken, 6),
      extraMasked: tgChatId ? String(tgChatId) : null,
    },
  };
}

export async function saveWebhookSettings(
  input: { slackWebhookUrl?: string | null; discordWebhookUrl?: string | null; telegramBotToken?: string | null; telegramChatId?: string | null },
  reason: string,
  actor: string,
): Promise<WebhooksSettings> {
  if (!reason?.trim()) throw new Error("reason is required");
  const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'webhook_channels'`;
  const before = row?.value ?? {};
  const next = { ...before };

  const updateField = (key: string, val: string | null | undefined) => {
    if (val !== undefined) {
      const trimmed = (val ?? "").trim();
      if (!trimmed || trimmed === "-") {
        delete next[key];
      } else {
        next[key] = trimmed;
      }
    }
  };

  updateField("slackWebhookUrl", input.slackWebhookUrl);
  updateField("discordWebhookUrl", input.discordWebhookUrl);
  updateField("telegramBotToken", input.telegramBotToken);
  updateField("telegramChatId", input.telegramChatId);

  await sql`
    INSERT INTO settings (key, value, updated_by) VALUES ('webhook_channels', ${sql.json(next)}, ${actor})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;

  invalidateSlackCache();
  invalidateDiscordCache();
  invalidateTelegramCache();

  await audit(actor, "settings.webhooks", "settings:webhook_channels", reason, before, next);
  return getWebhookSettings();
}

export async function testWebhookChannel(channel: "slack" | "discord" | "telegram"): Promise<{ ok: boolean; error?: string }> {
  const title = `🧪 888news 通知連線測試 (${channel.toUpperCase()})`;
  const lines = [
    `這是一則來自 888news 後台管理系統的即時連線測試訊息。`,
    `頻道: ${channel.toUpperCase()}`,
    `時間: ${new Date().toISOString()}`,
    `狀態: 連線測試正常，後續系統告警與反饋將能順暢推播。`,
  ];

  if (channel === "slack") {
    return sendSlackAlert(title, lines, "now");
  }
  if (channel === "discord") {
    return sendDiscordAlert(title, lines, "now");
  }
  if (channel === "telegram") {
    return sendTelegramAlert(title, lines, "now");
  }
  return { ok: false, error: "unknown channel" };
}

export interface LlmChannelConfig {
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  isConfigured: boolean;
  source: "env" | "db" | "none";
}

export interface LlmSettings {
  primary: LlmChannelConfig;
  fallback1: LlmChannelConfig;
  fallback2: LlmChannelConfig;
  waitingCount: number;
}

export async function getLlmSettings(): Promise<LlmSettings> {
  const dbConfig = await getDbLlmConfig();

  const mask = (s: string | null | undefined, keep = 4) => {
    if (!s) return null;
    if (s.length <= keep * 2) return `${s.slice(0, 2)}***${s.slice(-2)}`;
    return `${s.slice(0, keep)}...${s.slice(-keep)}`;
  };

  const primaryKey = dbConfig.llmApiKey || credential("models", "LLM_API_KEY") || process.env.LLM_API_KEY || null;
  const primaryBase = dbConfig.llmBaseUrl || credential("models", "LLM_BASE_URL") || process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const primaryModel = dbConfig.llmModel || process.env.LLM_MODEL || "gpt-4o-mini";

  const fb1Key = dbConfig.llmFallback1ApiKey || credential("models", "LLM_FALLBACK_1_API_KEY") || process.env.LLM_FALLBACK_1_API_KEY || null;
  const fb1Base = dbConfig.llmFallback1BaseUrl || credential("models", "LLM_FALLBACK_1_BASE_URL") || process.env.LLM_FALLBACK_1_BASE_URL || "";
  const fb1Model = dbConfig.llmFallback1Model || process.env.LLM_FALLBACK_1_MODEL || "";

  const fb2Key = dbConfig.llmFallback2ApiKey || credential("models", "LLM_FALLBACK_2_API_KEY") || process.env.LLM_FALLBACK_2_API_KEY || null;
  const fb2Base = dbConfig.llmFallback2BaseUrl || credential("models", "LLM_FALLBACK_2_BASE_URL") || process.env.LLM_FALLBACK_2_BASE_URL || "";
  const fb2Model = dbConfig.llmFallback2Model || process.env.LLM_FALLBACK_2_MODEL || "";

  let waitingCount = 0;
  try {
    const [row] = await sql<{ count: number }[]>`SELECT count(*)::int as count FROM articles WHERE processing_state = 'new' OR processing_state = 'failed'`;
    waitingCount = Number(row?.count ?? 0);
  } catch {}

  return {
    primary: {
      baseUrl: primaryBase,
      model: primaryModel,
      apiKeyMasked: mask(primaryKey),
      isConfigured: Boolean(primaryKey),
      source: dbConfig.llmApiKey ? "db" : primaryKey ? "env" : "none",
    },
    fallback1: {
      baseUrl: fb1Base,
      model: fb1Model,
      apiKeyMasked: mask(fb1Key),
      isConfigured: Boolean(fb1Key && fb1Model),
      source: dbConfig.llmFallback1ApiKey ? "db" : fb1Key ? "env" : "none",
    },
    fallback2: {
      baseUrl: fb2Base,
      model: fb2Model,
      apiKeyMasked: mask(fb2Key),
      isConfigured: Boolean(fb2Key && fb2Model),
      source: dbConfig.llmFallback2ApiKey ? "db" : fb2Key ? "env" : "none",
    },
    waitingCount,
  };
}

export async function saveLlmSettings(
  input: {
    llmBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
    llmFallback1BaseUrl?: string;
    llmFallback1ApiKey?: string;
    llmFallback1Model?: string;
    llmFallback2BaseUrl?: string;
    llmFallback2ApiKey?: string;
    llmFallback2Model?: string;
  },
  reason: string,
  actor: string,
): Promise<LlmSettings> {
  if (!reason?.trim()) throw new Error("reason is required");
  const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'llm_config'`;
  const before = row?.value ?? {};
  const next = { ...before };

  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) {
      const trimmed = String(v).trim();
      if (trimmed === "-") {
        delete next[k];
      } else if (trimmed) {
        next[k] = trimmed;
      }
    }
  }

  await sql`
    INSERT INTO settings (key, value, updated_by) VALUES ('llm_config', ${sql.json(next)}, ${actor})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;

  invalidateLlmConfigCache();
  await audit(actor, "settings.llm", "settings:llm_config", reason, before, next);

  // If primary key is configured, automatically requeue waiting articles!
  if (next.llmApiKey || credential("models", "LLM_API_KEY") || process.env.LLM_API_KEY) {
    try {
      await requeueAllWaitingArticles();
    } catch (e) {
      console.warn("Failed to auto-requeue articles after saving LLM settings:", e);
    }
  }

  return getLlmSettings();
}

export { testModelConnection, requeueAllWaitingArticles };

