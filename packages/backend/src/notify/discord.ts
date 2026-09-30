// Discord webhook delivery.
import { credential } from "../config.ts";

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // Integer decimal color (e.g. 0xFF0000)
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface DiscordMessagePayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

export function isDiscordConfigured(): boolean {
  return Boolean(credential("integrations", "DISCORD_WEBHOOK_URL") || process.env.DISCORD_WEBHOOK_URL);
}

export async function sendDiscordWebhook(
  payload: DiscordMessagePayload,
  webhookUrl?: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = webhookUrl || credential("integrations", "DISCORD_WEBHOOK_URL") || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, status: 0, error: "DISCORD_WEBHOOK_URL not configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "888news", ...payload }),
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

export async function sendDiscordAlert(
  title: string,
  lines: string[],
  level: "now" | "today" | "digest" = "now",
): Promise<{ ok: boolean; error?: string }> {
  const url = credential("integrations", "DISCORD_ALERT_WEBHOOK_URL") || credential("integrations", "DISCORD_WEBHOOK_URL") || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, error: "Discord not configured" };

  const color = level === "now" ? 0xED4245 : level === "today" ? 0xFEE75C : 0x57F287; // Red, Yellow, Green
  const payload: DiscordMessagePayload = {
    embeds: [
      {
        title,
        description: lines.join("\n"),
        color,
        timestamp: new Date().toISOString(),
        footer: { text: "888news Operations Alert" },
      },
    ],
  };

  const res = await sendDiscordWebhook(payload, url);
  return { ok: res.ok, error: res.error };
}

export async function sendDiscordFeedback(fb: {
  id: number;
  content: string;
  email?: string | null;
  pageUrl?: string | null;
  screenshotUrl?: string | null;
  createdAt: Date;
}): Promise<{ ok: boolean; error?: string }> {
  const url = credential("integrations", "DISCORD_FEEDBACK_WEBHOOK_URL") || credential("integrations", "DISCORD_WEBHOOK_URL") || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, error: "Discord not configured" };

  const fields = [
    ...(fb.email ? [{ name: "聯絡信箱", value: fb.email, inline: true }] : []),
    ...(fb.pageUrl ? [{ name: "來源網址", value: fb.pageUrl, inline: true }] : []),
  ];

  const payload: DiscordMessagePayload = {
    embeds: [
      {
        title: `💬 收到新使用者反饋 #${fb.id}`,
        description: fb.content,
        color: 0x5865F2, // Discord Blurple
        fields: fields.length ? fields : undefined,
        timestamp: fb.createdAt.toISOString(),
        footer: { text: "888news User Feedback" },
      },
    ],
  };

  const res = await sendDiscordWebhook(payload, url);
  return { ok: res.ok, error: res.error };
}
