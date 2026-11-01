// Private, authenticated bridge for reader-initiated BYOK calls. Keys live only in memory.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { config, credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { askWorkerHost } from "@aihot/backend/lib/ask-network";
import { guardedFetch, type GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { paidRequest, completeReceipt, ProviderRejectedError, BudgetNotConfiguredError } from "@aihot/backend/providers/receipts";

const endpoints: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};
const MAX_BODY = 100_000;
let active = 0;

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function sameSecret(actual: string | undefined, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk); total += part.length;
    if (total > MAX_BODY) throw new Error("Request too large");
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function startAskBridge() {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== "POST" || req.url !== "/ask") return reply(res, 404, { error: "Not found" });
      const secret = credential("auth", "IMG_PROXY_SIGN_SECRET");
      if (!sameSecret(req.headers["x-worker-secret"] as string | undefined, secret)) return reply(res, 403, { error: "Forbidden" });
      if (!config.modelCallsEnabled) return reply(res, 503, { error: "Model calls are disabled" });
      if (active >= 8) return reply(res, 503, { error: "Service busy" });
      active++;
      try {
        let body: any;
        try { body = await readBody(req); } catch { return reply(res, 400, { error: "Invalid request" }); }
        const { provider, model, key, messages } = body ?? {};
        if (typeof provider !== "string" || !Object.hasOwn(endpoints, provider) || typeof model !== "string" || !/^[\w.\-/:]{1,120}$/.test(model) || typeof key !== "string" || key.length < 1 || key.length > 512 || /[\r\n]/.test(key) || !Array.isArray(messages) || messages.length < 1 || messages.length > 30 || !messages.every((m: any) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 20000) || messages.reduce((n: number, m: any) => n + m.content.length, 0) > 70000) return reply(res, 400, { error: "Invalid request" });
        const result = await paidRequest({ service: "byok_llm", requireBudget: true, model, purpose: "byok_question", identity: randomUUID(), requestSummary: { provider } }, async () => {
          let response: GuardedResponse;
          try {
            response = await guardedFetch(endpoints[provider], { method: "POST", maxRedirects: 0, timeoutMs: 60_000, maxBytes: 500_000, route: "direct", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages, stream: false, max_tokens: 2048 }) });
          } catch { throw new Error("Model request failed or timed out"); }
          if (response.status < 200 || response.status >= 300) {
            if (response.status >= 400 && response.status < 500) throw new ProviderRejectedError("Model provider rejected the request", response.status, false);
            throw new Error("Model provider failed");
          }
          const raw = response.text();
          if (raw.length > 500_000) throw new Error("Model response too large");
          let parsed: any;
          try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid model response"); }
          const content = parsed?.choices?.[0]?.message?.content;
          if (typeof content !== "string" || !content.trim() || content.length > 100_000) throw new Error("Invalid model response");
          const usage: Record<string, number> = {};
          for (const field of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
            if (typeof parsed.usage?.[field] === "number" && Number.isFinite(parsed.usage[field])) usage[field] = parsed.usage[field];
          }
          return { response: { content }, usage };
        });
        await completeReceipt(sql, result.receiptId);
        return reply(res, 200, result.response);
      } catch (error) {
        if (error instanceof BudgetNotConfiguredError) return reply(res, 503, { error: "BYOK budget is not configured" });
        if (error instanceof ProviderRejectedError) return reply(res, 502, { error: `Model provider rejected the request (${error.status ?? "unknown"})` });
        return reply(res, 503, { error: "Model request unavailable. Check the key, model, budget, and worker settings." });
      } finally { active--; }
    })().catch(() => { if (!res.headersSent) reply(res, 503, { error: "Service unavailable" }); else res.destroy(); });
  });
  server.listen(Number(process.env.ASK_WORKER_PORT || 3002), askWorkerHost());
  return server;
}
