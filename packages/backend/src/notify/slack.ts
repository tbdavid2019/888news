import { credential } from "../config.ts";
import { sql } from "../db.ts";

export interface SlackMessagePayload {
  text: string;
  blocks?: Array<Record<string, unknown>>;
  attachments?: Array<{
    color?: string;
    title?: string;
    text?: string;
    fields?: Array<{ title: string; value: string; short?: boolean }>;
    footer?: string;
    ts?: number;
  }>;
}

let cachedDbSlackUrl: string | null | undefined = undefined;

export function invalidateSlackCache() {
  cachedDbSlackUrl = undefined;
}

export async function getSlackWebhookUrl(): Promise<string | null> {
  if (cachedDbSlackUrl !== undefined) return cachedDbSlackUrl;
  try {
    const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'webhook_channels'`;
    if (row?.value?.slackWebhookUrl) {
      cachedDbSlackUrl = row.value.slackWebhookUrl;
      return cachedDbSlackUrl;
    }
  } catch {}
  cachedDbSlackUrl = credential("integrations", "SLACK_WEBHOOK_URL") || process.env.SLACK_WEBHOOK_URL || null;
  return cachedDbSlackUrl;
}

export function isSlackConfigured(): boolean {
  return Boolean(cachedDbSlackUrl || credential("integrations", "SLACK_WEBHOOK_URL") || process.env.SLACK_WEBHOOK_URL);
}

export async function sendSlackWebhook(
  payload: SlackMessagePayload,
  webhookUrl?: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = webhookUrl || (await getSlackWebhookUrl());
  if (!url) return { ok: false, status: 0, error: "SLACK_WEBHOOK_URL not configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendSlackAlert(
  title: string,
  lines: string[],
  level: "now" | "today" | "digest" = "now",
): Promise<{ ok: boolean; error?: string }> {
  const url = credential("integrations", "SLACK_ALERT_WEBHOOK_URL") || (await getSlackWebhookUrl());
  if (!url) return { ok: false, error: "Slack not configured" };

  const color = level === "now" ? "#E01E5A" : level === "today" ? "#ECB22E" : "#2EB886";
  const payload: SlackMessagePayload = {
    text: title,
    attachments: [
      {
        color,
        title,
        text: lines.join("\n"),
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  const res = await sendSlackWebhook(payload, url);
  return { ok: res.ok, error: res.error };
}

export async function sendSlackFeedback(fb: {
  id: number;
  content: string;
  email?: string | null;
  pageUrl?: string | null;
  screenshotUrl?: string | null;
  createdAt: Date;
}): Promise<{ ok: boolean; error?: string }> {
  const url = credential("integrations", "SLACK_FEEDBACK_WEBHOOK_URL") || (await getSlackWebhookUrl());
  if (!url) return { ok: false, error: "Slack not configured" };

  const fields = [
    ...(fb.email ? [{ title: "聯絡信箱", value: fb.email, short: true }] : []),
    ...(fb.pageUrl ? [{ title: "來源網址", value: `<${fb.pageUrl}|查看頁面>`, short: true }] : []),
  ];

  const payload: SlackMessagePayload = {
    text: `💬 收到新使用者反饋 #${fb.id}`,
    attachments: [
      {
        color: "#4A154B",
        title: `反饋內容 #${fb.id}`,
        text: fb.content,
        fields: fields.length ? fields : undefined,
        footer: `888news Feedback · ${fb.createdAt.toISOString()}`,
        ts: Math.floor(fb.createdAt.getTime() / 1000),
      },
    ],
  };

  const res = await sendSlackWebhook(payload, url);
  return { ok: res.ok, error: res.error };
}
