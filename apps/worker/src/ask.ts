// Private, authenticated bridge for reader-initiated BYOK calls.
// Completely stateless: keys and conversation contents live only in memory during the request.
// Never written to the database or receipts table.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { credential } from "@aihot/backend/config";
import { askWorkerHost } from "@aihot/backend/lib/ask-network";
import { assertPublicUrl } from "@aihot/backend/lib/url";

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

const MAX_BODY = 150_000;
let active = 0;

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sameSecret(actual: string | undefined, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk);
    total += part.length;
    if (total > MAX_BODY) throw new Error("Request too large");
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function startAskBridge() {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== "POST" || req.url !== "/ask") return reply(res, 404, { error: "Not found" });

      const secret = process.env.ASK_WORKER_SECRET || credential("auth", "IMG_PROXY_SIGN_SECRET");
      if (!sameSecret(req.headers["x-worker-secret"] as string | undefined, secret)) {
        return reply(res, 403, { error: "Forbidden" });
      }

      if (process.env.BYOK_ENABLED === "false") {
        return reply(res, 503, { error: "BYOK service is disabled" });
      }

      if (active >= 12) return reply(res, 503, { error: "Service busy" });
      active++;

      try {
        let body: any;
        try {
          body = await readBody(req);
        } catch {
          return reply(res, 400, { error: "Invalid request payload" });
        }

        const { provider, model, key, baseUrl, messages, stream = true } = body ?? {};

        // Validation
        const validProvider = typeof provider === "string" && (Object.hasOwn(DEFAULT_ENDPOINTS, provider) || provider === "custom");
        if (!validProvider) return reply(res, 400, { error: "Invalid provider" });

        if (typeof model !== "string" || !/^[\w.\-/:]{1,120}$/.test(model)) {
          return reply(res, 400, { error: "Invalid model identifier" });
        }

        if (typeof key !== "string" || key.length < 1 || key.length > 512 || /[\r\n]/.test(key)) {
          return reply(res, 400, { error: "Invalid API key" });
        }

        if (
          !Array.isArray(messages) ||
          messages.length < 1 ||
          messages.length > 30 ||
          !messages.every((m: any) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 40000) ||
          messages.reduce((n: number, m: any) => n + m.content.length, 0) > 120000
        ) {
          return reply(res, 400, { error: "Invalid messages array or total length exceeded" });
        }

        // Determine destination endpoint
        let endpointUrl: string;
        if (provider === "custom") {
          if (typeof baseUrl !== "string" || !baseUrl.trim()) {
            return reply(res, 400, { error: "baseUrl is required for custom provider" });
          }
          const rawUrl = baseUrl.trim().endsWith("/chat/completions") ? baseUrl.trim() : `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
          try {
            await assertPublicUrl(rawUrl, false);
            endpointUrl = rawUrl;
          } catch {
            return reply(res, 400, { error: "Custom baseUrl is invalid or resolves to a private network" });
          }
        } else {
          endpointUrl = DEFAULT_ENDPOINTS[provider]!;
        }

        // Forward to LLM Provider
        const signal = AbortSignal.timeout(90_000);
        let providerRes: Response;
        try {
          providerRes = await fetch(endpointUrl, {
            method: "POST",
            signal,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              messages,
              stream: stream !== false,
              max_tokens: 4096,
            }),
          });
        } catch (fetchErr: any) {
          return reply(res, 502, { error: `Model provider connection failed: ${fetchErr?.message || "timeout"}` });
        }

        if (!providerRes.ok) {
          const errText = await providerRes.text().catch(() => "");
          let errDetail = `Model provider returned error (${providerRes.status})`;
          try {
            const errJson = JSON.parse(errText);
            if (errJson?.error?.message) errDetail = errJson.error.message;
          } catch {
            if (errText) errDetail = errText.slice(0, 200);
          }
          return reply(res, providerRes.status >= 400 && providerRes.status < 600 ? providerRes.status : 502, { error: errDetail });
        }

        if (stream !== false) {
          res.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            "x-accel-buffering": "no",
            connection: "keep-alive",
          });
          if (providerRes.body) {
            for await (const chunk of providerRes.body as unknown as AsyncIterable<Uint8Array>) {
              res.write(chunk);
            }
          }
          return res.end();
        } else {
          const rawText = await providerRes.text();
          let parsed: any;
          try {
            parsed = JSON.parse(rawText);
          } catch {
            return reply(res, 502, { error: "Model provider returned malformed JSON" });
          }
          const content = parsed?.choices?.[0]?.message?.content ?? "";
          const usage = parsed?.usage ?? {};
          return reply(res, 200, { content, usage });
        }
      } catch (err: any) {
        return reply(res, 500, { error: err?.message || "Internal server error" });
      } finally {
        active--;
      }
    })().catch(() => {
      if (!res.headersSent) reply(res, 503, { error: "Service unavailable" });
      else res.destroy();
    });
  });

  server.listen(Number(process.env.ASK_WORKER_PORT || 3002), askWorkerHost());
  return server;
}
