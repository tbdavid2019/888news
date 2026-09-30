// Unified multi-channel notification dispatcher.
// Concurrently broadcasts alerts, feedbacks, and briefings across Slack, Discord, Telegram, and Feishu.
import { isSlackConfigured, sendSlackAlert, sendSlackFeedback } from "./slack.ts";
import { isDiscordConfigured, sendDiscordAlert, sendDiscordFeedback } from "./discord.ts";
import { isTelegramConfigured, sendTelegramAlert, sendTelegramFeedback } from "./telegram.ts";
import { feishuInternalEnabled, sendAlert as sendFeishuAlert } from "./feishu.ts";

export type AlertLevel = "now" | "today" | "digest";

export interface FeedbackNotification {
  id: number;
  content: string;
  email?: string | null;
  pageUrl?: string | null;
  screenshotUrl?: string | null;
  createdAt: Date;
}

export interface DispatchAlertResult {
  dispatchedChannels: string[];
  errors: Record<string, string>;
}

/**
 * Dispatches an operations alert to all configured channels in parallel.
 */
export async function dispatchAlert(
  title: string,
  lines: string[],
  level: AlertLevel = "now",
): Promise<DispatchAlertResult> {
  const tasks: Array<Promise<{ channel: string; ok: boolean; error?: string }>> = [];

  if (isSlackConfigured()) {
    tasks.push(
      sendSlackAlert(title, lines, level)
        .then((r) => ({ channel: "slack", ok: r.ok, error: r.error }))
        .catch((e) => ({ channel: "slack", ok: false, error: String(e) })),
    );
  }

  if (isDiscordConfigured()) {
    tasks.push(
      sendDiscordAlert(title, lines, level)
        .then((r) => ({ channel: "discord", ok: r.ok, error: r.error }))
        .catch((e) => ({ channel: "discord", ok: false, error: String(e) })),
    );
  }

  if (isTelegramConfigured()) {
    tasks.push(
      sendTelegramAlert(title, lines, level)
        .then((r) => ({ channel: "telegram", ok: r.ok, error: r.error }))
        .catch((e) => ({ channel: "telegram", ok: false, error: String(e) })),
    );
  }

  if (feishuInternalEnabled()) {
    tasks.push(
      sendFeishuAlert(title, lines)
        .then((r) => ({ channel: "feishu", ok: r === "sent", error: r === "disabled" ? "disabled" : undefined }))
        .catch((e) => ({ channel: "feishu", ok: false, error: String(e) })),
    );
  }

  const results = await Promise.allSettled(tasks);
  const dispatchedChannels: string[] = [];
  const errors: Record<string, string> = {};

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.ok) dispatchedChannels.push(r.value.channel);
      else if (r.value.error) errors[r.value.channel] = r.value.error;
    }
  }

  if (dispatchedChannels.length === 0 && Object.keys(errors).length === 0) {
    // No channels configured, log locally
    console.log(JSON.stringify({ level: "info", msg: "alert (no notification channels configured)", title, lines }));
  }

  return { dispatchedChannels, errors };
}

/**
 * Dispatches a user feedback submission to all configured channels in parallel.
 */
export async function dispatchFeedback(fb: FeedbackNotification): Promise<DispatchAlertResult> {
  const tasks: Array<Promise<{ channel: string; ok: boolean; error?: string }>> = [];

  if (isSlackConfigured()) {
    tasks.push(
      sendSlackFeedback(fb)
        .then((r) => ({ channel: "slack", ok: r.ok, error: r.error }))
        .catch((e) => ({ channel: "slack", ok: false, error: String(e) })),
    );
  }

  if (isDiscordConfigured()) {
    tasks.push(
      sendDiscordFeedback(fb)
        .then((r) => ({ channel: "discord", ok: r.ok, error: r.error }))
        .catch((e) => ({ channel: "discord", ok: false, error: String(e) })),
    );
  }

  if (isTelegramConfigured()) {
    tasks.push(
      sendTelegramFeedback(fb)
        .then((r) => ({ channel: "telegram", ok: r.ok, error: r.error }))
        .catch((e) => ({ channel: "telegram", ok: false, error: String(e) })),
    );
  }

  const results = await Promise.allSettled(tasks);
  const dispatchedChannels: string[] = [];
  const errors: Record<string, string> = {};

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.ok) dispatchedChannels.push(r.value.channel);
      else if (r.value.error) errors[r.value.channel] = r.value.error;
    }
  }

  return { dispatchedChannels, errors };
}
