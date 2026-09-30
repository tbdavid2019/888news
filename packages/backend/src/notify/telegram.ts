// Telegram Bot API notification delivery.
import { credential } from "../config.ts";

export function isTelegramConfigured(): boolean {
  const token = credential("integrations", "TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN;
  const chat = credential("integrations", "TELEGRAM_CHAT_ID") || process.env.TELEGRAM_CHAT_ID;
  return Boolean(token && chat);
}

export async function sendTelegramMessage(
  text: string,
  opts?: { chatId?: string; parseMode?: "HTML" | "MarkdownV2"; disableWebPreview?: boolean },
): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = credential("integrations", "TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts?.chatId || credential("integrations", "TELEGRAM_CHAT_ID") || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, status: 0, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts?.parseMode ?? "HTML",
        disable_web_page_preview: opts?.disableWebPreview ?? true,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errJson = await res.text();
      return { ok: false, status: res.status, error: errJson };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTelegramAlert(
  title: string,
  lines: string[],
  level: "now" | "today" | "digest" = "now",
): Promise<{ ok: boolean; error?: string }> {
  const chatId = credential("integrations", "TELEGRAM_ALERT_CHAT_ID") || credential("integrations", "TELEGRAM_CHAT_ID") || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { ok: false, error: "Telegram chatId not configured" };

  const icon = level === "now" ? "🚨" : level === "today" ? "⚠️" : "📋";
  const formattedText = `<b>${icon} ${escapeHtml(title)}</b>\n\n${lines.map((l) => escapeHtml(l)).join("\n")}`.slice(0, 4000);

  const res = await sendTelegramMessage(formattedText, { chatId, parseMode: "HTML" });
  return { ok: res.ok, error: res.error };
}

export async function sendTelegramFeedback(fb: {
  id: number;
  content: string;
  email?: string | null;
  pageUrl?: string | null;
  screenshotUrl?: string | null;
  createdAt: Date;
}): Promise<{ ok: boolean; error?: string }> {
  const chatId = credential("integrations", "TELEGRAM_FEEDBACK_CHAT_ID") || credential("integrations", "TELEGRAM_CHAT_ID") || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { ok: false, error: "Telegram chatId not configured" };

  const safeContent = fb.content.length > 3500 ? `${fb.content.slice(0, 3500)}... (內容過長已截斷)` : fb.content;
  let formatted = `<b>💬 收到新使用者反饋 #${fb.id}</b>\n\n${escapeHtml(safeContent)}`;
  if (fb.email) formatted += `\n\n📧 聯絡信箱: <code>${escapeHtml(fb.email)}</code>`;
  if (fb.pageUrl) formatted += `\n🔗 來源網址: <a href="${escapeHtml(fb.pageUrl)}">${escapeHtml(fb.pageUrl)}</a>`;

  const res = await sendTelegramMessage(formatted, { chatId, parseMode: "HTML" });
  return { ok: res.ok, error: res.error };
}
