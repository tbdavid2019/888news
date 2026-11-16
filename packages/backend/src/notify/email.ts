import { randomUUID } from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";

export interface EmailConfig {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string | null;
  to: string[];
}

export interface SendMailOptions {
  subject: string;
  text: string;
  to?: string[];
  cfg?: EmailConfig;
  timeoutMs?: number;
  /** Internal test hook for socket injection. */
  connect?: (cfg: EmailConfig) => Promise<net.Socket>;
}

let cachedDbAlertEmailTo: string | null | undefined = undefined;

export function invalidateEmailCache() {
  cachedDbAlertEmailTo = undefined;
}

export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s;]+/)
    .map((v) => v.trim())
    .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

export function extractAddress(mailbox: string): string {
  const m = /<([^<>]+)>/.exec(mailbox);
  const addr = (m ? m[1]! : mailbox).replace(/[\r\n]/g, "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new Error(`Invalid email address: ${mailbox}`);
  return addr;
}

function readEnvEmailConfig(): EmailConfig {
  const host = credential("integrations", "SMTP_HOST") || process.env.SMTP_HOST || null;
  const rawPort = credential("integrations", "SMTP_PORT") || process.env.SMTP_PORT || "";
  const port = rawPort ? Number.parseInt(rawPort, 10) : 465;
  const rawSecure = credential("integrations", "SMTP_SECURE") || process.env.SMTP_SECURE || "";
  const secure = rawSecure ? rawSecure.toLowerCase() === "true" || rawSecure === "1" : port === 465;
  const user = credential("integrations", "SMTP_USER") || process.env.SMTP_USER || null;
  const pass = credential("integrations", "SMTP_PASS") || process.env.SMTP_PASS || null;
  const from = credential("integrations", "SMTP_FROM") || process.env.SMTP_FROM || null;
  const to = parseEmailList(credential("integrations", "ALERT_EMAIL_TO") || process.env.ALERT_EMAIL_TO);
  return {
    host: host?.trim() || null,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    secure,
    user: user?.trim() || null,
    pass: pass ?? null,
    from: from?.trim() || null,
    to,
  };
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const envCfg = readEnvEmailConfig();
  if (cachedDbAlertEmailTo === undefined) {
    try {
      const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'webhook_channels'`;
      if (row?.value && Object.hasOwn(row.value, "alertEmailTo")) {
        const val = row.value.alertEmailTo;
        cachedDbAlertEmailTo = val === "" || val === "disabled" ? "" : val;
      } else {
        cachedDbAlertEmailTo = null;
      }
    } catch {
      cachedDbAlertEmailTo = null;
    }
  }
  const to = cachedDbAlertEmailTo === ""
    ? []
    : cachedDbAlertEmailTo
      ? parseEmailList(cachedDbAlertEmailTo)
      : envCfg.to;
  return { ...envCfg, to };
}

export function isEmailConfigured(): boolean {
  const envCfg = readEnvEmailConfig();
  const to = cachedDbAlertEmailTo === ""
    ? []
    : cachedDbAlertEmailTo
      ? parseEmailList(cachedDbAlertEmailTo)
      : envCfg.to;
  return Boolean(envCfg.host && envCfg.from && envCfg.user && envCfg.pass && to.length > 0);
}

function encodeSubject(subject: string): string {
  const clean = subject.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function wrapBase64(text: string): string {
  const b64 = Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

export function buildMimeMessage(opts: { from: string; to: string[]; subject: string; text: string; host?: string }): string {
  const fromAddr = extractAddress(opts.from);
  const domain = fromAddr.split("@")[1] || opts.host || "localhost";
  const fromHeader = opts.from.includes("<") ? opts.from.replace(/[\r\n]+/g, " ").trim() : `888news 系統通知 <${fromAddr}>`;
  const headers = [
    `From: ${fromHeader}`,
    `To: ${opts.to.map((addr) => extractAddress(addr)).join(", ")}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrapBase64(opts.text)}`;
}

interface SmtpReply {
  code: number;
  lines: string[];
}

class SmtpClient {
  private socket: net.Socket;
  private buffer = "";
  private pending: { resolve: (reply: SmtpReply) => void; reject: (err: Error) => void } | null = null;
  private lines: string[] = [];
  private closed = false;

  constructor(socket: net.Socket, timeoutMs: number) {
    this.socket = socket;
    this.socket.setTimeout(timeoutMs);
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (err) => this.fail(err));
    this.socket.on("timeout", () => this.fail(new Error("SMTP connection timed out")));
    this.socket.on("close", () => {
      this.closed = true;
      if (this.pending) this.fail(new Error("SMTP connection closed unexpectedly"));
    });
  }

  private fail(err: Error) {
    if (this.pending) {
      const { reject } = this.pending;
      this.pending = null;
      this.lines = [];
      reject(err);
    }
  }

  private onData(chunk: Buffer | string) {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx < 0) break;
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      this.lines.push(line);
      const m = /^(\d{3})([ -])(.*)$/.exec(line);
      if (m && m[2] === " ") {
        const reply: SmtpReply = { code: Number(m[1]), lines: this.lines };
        this.lines = [];
        if (this.pending) {
          const { resolve } = this.pending;
          this.pending = null;
          resolve(reply);
        }
      }
    }
  }

  readReply(): Promise<SmtpReply> {
    if (this.closed) return Promise.reject(new Error("SMTP socket is closed"));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  async command(line: string, expectedCodes: number[]): Promise<SmtpReply> {
    const replyPromise = this.readReply();
    await new Promise<void>((resolve, reject) => {
      this.socket.write(`${line}\r\n`, "utf8", (err) => (err ? reject(err) : resolve()));
    });
    const reply = await replyPromise;
    if (!expectedCodes.includes(reply.code)) {
      throw new Error(`SMTP error (${reply.code}): ${reply.lines.join(" | ")}`);
    }
    return reply;
  }

  async writeBody(rawMessage: string): Promise<SmtpReply> {
    // Dot-stuff lines beginning with "." per RFC 5321 section 4.5.2.
    const stuffed = rawMessage
      .split("\r\n")
      .map((l) => (l.startsWith(".") ? `.${l}` : l))
      .join("\r\n");
    const replyPromise = this.readReply();
    await new Promise<void>((resolve, reject) => {
      this.socket.write(`${stuffed}\r\n.\r\n`, "utf8", (err) => (err ? reject(err) : resolve()));
    });
    const reply = await replyPromise;
    if (reply.code !== 250) {
      throw new Error(`SMTP DATA rejected (${reply.code}): ${reply.lines.join(" | ")}`);
    }
    return reply;
  }

  upgradeTls(servername: string, timeoutMs: number): Promise<SmtpClient> {
    return new Promise((resolve, reject) => {
      const raw = this.socket;
      raw.removeAllListeners("data");
      raw.removeAllListeners("error");
      raw.removeAllListeners("timeout");
      raw.removeAllListeners("close");
      const tlsSock = tls.connect({ socket: raw, servername, minVersion: "TLSv1.2" }, () => {
        resolve(new SmtpClient(tlsSock, timeoutMs));
      });
      tlsSock.once("error", reject);
    });
  }

  destroy() {
    this.socket.destroy();
  }
}

function connectSocket(cfg: EmailConfig, timeoutMs: number): Promise<net.Socket> {
  if (!cfg.host) return Promise.reject(new Error("SMTP_HOST is not configured"));
  return new Promise((resolve, reject) => {
    const onErr = (err: Error) => reject(err);
    const sock: net.Socket = cfg.secure
      ? tls.connect({ host: cfg.host!, port: cfg.port, servername: cfg.host!, minVersion: "TLSv1.2" })
      : net.connect({ host: cfg.host!, port: cfg.port });
    sock.setTimeout(timeoutMs);
    sock.once("error", onErr);
    sock.once("timeout", () => {
      sock.destroy();
      reject(new Error("SMTP connection timed out"));
    });
    sock.once(cfg.secure ? "secureConnect" : "connect", () => {
      sock.off("error", onErr);
      resolve(sock);
    });
  });
}

export async function sendEmailMessage(opts: SendMailOptions): Promise<{ ok: boolean; error?: string }> {
  const cfg = opts.cfg ?? (await getEmailConfig());
  const recipients = (opts.to ?? cfg.to).map((r) => extractAddress(r));
  if (!cfg.host || !cfg.from || !recipients.length) {
    return { ok: false, error: "SMTP not configured (require SMTP_HOST, SMTP_FROM, ALERT_EMAIL_TO)" };
  }

  const timeoutMs = opts.timeoutMs ?? 15_000;
  let client: SmtpClient | null = null;
  try {
    const sock = opts.connect ? await opts.connect(cfg) : await connectSocket(cfg, timeoutMs);
    client = new SmtpClient(sock, timeoutMs);

    const greeting = await client.readReply();
    if (greeting.code !== 220) throw new Error(`SMTP greeting rejected (${greeting.code}): ${greeting.lines.join(" | ")}`);

    const fromAddr = extractAddress(cfg.from);
    const ehloHost = config.siteUrl.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] || "localhost";
    let ehlo = await client.command(`EHLO ${ehloHost}`, [250]);

    if (!cfg.secure && !opts.connect && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      await client.command("STARTTLS", [220]);
      client = await client.upgradeTls(cfg.host, timeoutMs);
      ehlo = await client.command(`EHLO ${ehloHost}`, [250]);
    }

    if (cfg.user && cfg.pass) {
      const authCaps = ehlo.lines.find((l) => /^\d{3}[ -]AUTH\b/i.test(l)) ?? "";
      if (/PLAIN/i.test(authCaps) && !/LOGIN/i.test(authCaps)) {
        const token = Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass}`, "utf8").toString("base64");
        await client.command(`AUTH PLAIN ${token}`, [235]);
      } else {
        await client.command("AUTH LOGIN", [334]);
        await client.command(Buffer.from(cfg.user, "utf8").toString("base64"), [334]);
        await client.command(Buffer.from(cfg.pass, "utf8").toString("base64"), [235]);
      }
    }

    await client.command(`MAIL FROM:<${fromAddr}>`, [250]);
    for (const rcpt of recipients) {
      await client.command(`RCPT TO:<${rcpt}>`, [250, 251]);
    }
    await client.command("DATA", [354]);
    const mime = buildMimeMessage({ from: cfg.from, to: recipients, subject: opts.subject, text: opts.text, host: ehloHost });
    await client.writeBody(mime);
    await client.command("QUIT", [221]).catch(() => undefined);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client?.destroy();
  }
}

export async function sendEmailAlert(
  title: string,
  lines: string[],
  level: "now" | "today" | "digest" = "now",
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getEmailConfig();
  if (!cfg.host || !cfg.from || !cfg.to.length || !cfg.user || !cfg.pass) {
    return { ok: false, error: "SMTP not configured" };
  }

  const levelLabel = level === "now" ? "緊急告警" : level === "today" ? "今日關注" : "每日摘要";
  const envTag = config.environmentName && config.environmentName !== "production" ? `[${config.environmentName}] ` : "";
  const nowStr = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

  const subject = `${envTag}[888news · ${levelLabel}] ${title}`;
  const body = [
    `${title}`,
    "",
    ...lines,
    "",
    "---",
    `級別：${levelLabel}`,
    `時間：${nowStr} (Asia/Taipei)`,
    `站點：${config.siteUrl}`,
  ].join("\n");

  return sendEmailMessage({ subject, text: body, cfg });
}

export async function sendEmailFeedback(fb: {
  id: number;
  content: string;
  email?: string | null;
  pageUrl?: string | null;
  screenshotUrl?: string | null;
  createdAt: Date;
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getEmailConfig();
  if (!cfg.host || !cfg.from || !cfg.to.length || !cfg.user || !cfg.pass) {
    return { ok: false, error: "SMTP not configured" };
  }

  const timeStr = fb.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
  const lines = [
    `收到來自使用者的意見反饋 (#${fb.id})`,
    "",
    `時間：${timeStr} (Asia/Taipei)`,
    ...(fb.email ? [`聯絡信箱：${fb.email}`] : []),
    ...(fb.pageUrl ? [`來源頁面：${fb.pageUrl}`] : []),
    ...(fb.screenshotUrl ? [`附圖連結：${fb.screenshotUrl}`] : []),
    "",
    "內容：",
    fb.content.length > 4000 ? `${fb.content.slice(0, 4000)}\n...（內容過長已截斷）` : fb.content,
    "",
    "---",
    `後台處理：${config.siteUrl}/admin/feedback`,
  ];

  return sendEmailMessage({
    subject: `[888news · 使用者反饋] #${fb.id}`,
    text: lines.join("\n"),
    cfg,
  });
}
