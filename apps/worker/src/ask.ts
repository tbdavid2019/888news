// Private, authenticated bridge for reader-initiated BYOK calls.
// Completely stateless: keys and conversation contents live only in memory during the request.
// Never written to the database or receipts table.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { config, credential } from "@aihot/backend/config";
import { askWorkerHost } from "@aihot/backend/lib/ask-network";
import { assertPublicUrl } from "@aihot/backend/lib/url";

const DEFAULT_CHAT_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
};

const DEFAULT_MODELS_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  groq: "https://api.groq.com/openai/v1/models",
  grok: "https://api.x.ai/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  deepseek: "https://api.deepseek.com/models",
};

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  const nonChatSubstrings = [
    "embed",
    "whisper",
    "tts-",
    "dall-e",
    "moderation",
    "realtime",
    "babbage",
    "davinci",
    "rerank",
    "guard",
    "transcription",
    "audio-preview",
  ];
  return !nonChatSubstrings.some((term) => lower.includes(term));
}

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

async function handleAskModels(req: IncomingMessage, res: ServerResponse) {
  if (active >= 16) return reply(res, 503, { error: "Service busy" });
  active++;

  const abortController = new AbortController();
  const closeHandler = () => {
    if (!res.writableEnded) abortController.abort();
  };
  res.once("close", closeHandler);

  try {
    let body: any;
    try {
      body = await readBody(req);
    } catch {
      return reply(res, 400, { error: "Invalid request payload" });
    }

    const { provider, key, baseUrl } = body ?? {};

    const validProvider = typeof provider === "string" && (Object.hasOwn(DEFAULT_MODELS_ENDPOINTS, provider) || provider === "custom" || provider === "bedrock");
    if (!validProvider) return reply(res, 400, { error: "Invalid provider" });

    if (typeof key !== "string" || key.length < 1 || key.length > 512 || /[\r\n]/.test(key)) {
      return reply(res, 400, { error: "Invalid API key" });
    }

    let endpointUrl: string;
    const headers: Record<string, string> = {
      accept: "application/json",
    };

    if (provider === "gemini") {
      endpointUrl = "https://generativelanguage.googleapis.com/v1beta/models";
      headers["x-goog-api-key"] = key;
    } else if (provider === "bedrock") {
      const region = (typeof baseUrl === "string" && /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(baseUrl.trim()))
        ? baseUrl.trim()
        : "us-east-1";
      endpointUrl = `https://bedrock-runtime.${region}.amazonaws.com/openai/v1/models`;
      headers["authorization"] = `Bearer ${key}`;
    } else if (provider === "custom") {
      if (typeof baseUrl !== "string" || !baseUrl.trim()) {
        return reply(res, 400, { error: "baseUrl is required for custom provider" });
      }
      const trimmed = baseUrl.trim();
      if (!trimmed.startsWith("https://")) {
        return reply(res, 400, { error: "Custom endpoints must use HTTPS" });
      }
      const cleanBase = trimmed.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
      const rawUrl = cleanBase.endsWith("/models") ? cleanBase : `${cleanBase}/models`;
      try {
        await assertPublicUrl(rawUrl, false);
        endpointUrl = rawUrl;
        headers["authorization"] = `Bearer ${key}`;
      } catch {
        return reply(res, 400, { error: "Custom baseUrl is invalid or resolves to a private network" });
      }
    } else {
      endpointUrl = DEFAULT_MODELS_ENDPOINTS[provider]!;
      headers["authorization"] = `Bearer ${key}`;
    }

    const timeoutSignal = AbortSignal.timeout(15_000);
    const combinedSignal = AbortSignal.any ? AbortSignal.any([abortController.signal, timeoutSignal]) : abortController.signal;

    let providerRes: Response;
    try {
      providerRes = await fetch(endpointUrl, {
        method: "GET",
        redirect: "error",
        signal: combinedSignal,
        headers,
      });
    } catch (fetchErr: any) {
      if (abortController.signal.aborted) return;
      return reply(res, 502, { error: `Model provider connection failed: ${fetchErr?.message || "timeout"}` });
    }

    if (!providerRes.ok) {
      const errText = await providerRes.text().catch(() => "");
      let errDetail = `Model provider returned error (${providerRes.status})`;
      if (errText.trim().startsWith("<")) {
        errDetail = `Model provider returned HTML error (${providerRes.status})`;
      } else {
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.message) errDetail = errJson.error.message;
          else if (errJson?.message) errDetail = errJson.message;
        } catch {
          if (errText) errDetail = errText.slice(0, 200);
        }
      }
      return reply(res, providerRes.status >= 400 && providerRes.status < 600 ? providerRes.status : 502, { error: errDetail });
    }

    let json: any;
    try {
      json = await providerRes.json();
    } catch {
      return reply(res, 502, { error: "Model provider returned malformed JSON" });
    }

    const rawList: any[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.models) ? json.models : []);
    const extracted: string[] = [];
    for (const item of rawList) {
      if (!item) continue;
      if (typeof item === "string" && item.trim()) {
        extracted.push(item.trim());
      } else if (typeof item === "object") {
        if (item.active === false) continue;
        const id = typeof item.id === "string" ? item.id : (typeof item.name === "string" ? item.name : "");
        if (id && typeof id === "string") {
          const cleanId = id.startsWith("models/") ? id.slice(7) : id;
          extracted.push(cleanId);
        }
      }
    }

    const chatOnly = extracted.filter(isChatModel);
    const finalModels = chatOnly.length > 0 ? chatOnly : extracted;
    const uniqueModels = Array.from(new Set(finalModels)).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    return reply(res, 200, { models: uniqueModels });
  } catch (err: any) {
    if (!abortController.signal.aborted) {
      return reply(res, 500, { error: err?.message || "Internal server error" });
    }
  } finally {
    res.off("close", closeHandler);
    active--;
  }
}

async function handleAskStream(req: IncomingMessage, res: ServerResponse) {
  if (active >= 16) return reply(res, 503, { error: "Service busy" });
  active++;

  const abortController = new AbortController();
  const closeHandler = () => {
    if (!res.writableEnded) abortController.abort();
  };
  res.once("close", closeHandler);

  try {
    let body: any;
    try {
      body = await readBody(req);
    } catch {
      return reply(res, 400, { error: "Invalid request payload" });
    }

    const { provider, model, key, baseUrl, messages, stream = true } = body ?? {};

    // Validation
    const validProvider = typeof provider === "string" && (Object.hasOwn(DEFAULT_CHAT_ENDPOINTS, provider) || provider === "custom" || provider === "bedrock");
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
    if (provider === "bedrock") {
      const region = (typeof baseUrl === "string" && /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(baseUrl.trim()))
        ? baseUrl.trim()
        : "us-east-1";
      endpointUrl = `https://bedrock-runtime.${region}.amazonaws.com/openai/v1/chat/completions`;
    } else if (provider === "custom") {
      if (typeof baseUrl !== "string" || !baseUrl.trim()) {
        return reply(res, 400, { error: "baseUrl is required for custom provider" });
      }
      const trimmed = baseUrl.trim();
      // Strictly enforce HTTPS for custom endpoints to prevent cleartext token leakage
      if (!trimmed.startsWith("https://")) {
        return reply(res, 400, { error: "Custom endpoints must use HTTPS" });
      }
      const rawUrl = trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed.replace(/\/+$/, "")}/chat/completions`;
      try {
        await assertPublicUrl(rawUrl, false);
        endpointUrl = rawUrl;
      } catch {
        return reply(res, 400, { error: "Custom baseUrl is invalid or resolves to a private network" });
      }
    } else {
      endpointUrl = DEFAULT_CHAT_ENDPOINTS[provider]!;
    }

    // Forward to LLM Provider with redirect: "error" to prevent SSRF bypass
    const timeoutSignal = AbortSignal.timeout(90_000);
    const combinedSignal = AbortSignal.any ? AbortSignal.any([abortController.signal, timeoutSignal]) : abortController.signal;

    let providerRes: Response;
    try {
      providerRes = await fetch(endpointUrl, {
        method: "POST",
        redirect: "error",
        signal: combinedSignal,
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
      if (abortController.signal.aborted) return;
      return reply(res, 502, { error: `Model provider connection failed: ${fetchErr?.message || "timeout"}` });
    }

    if (!providerRes.ok) {
      const errText = await providerRes.text().catch(() => "");
      let errDetail = `Model provider returned error (${providerRes.status})`;
      if (errText.trim().startsWith("<")) {
        errDetail = `Model provider returned HTML error (${providerRes.status})`;
      } else {
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.message) errDetail = errJson.error.message;
        } catch {
          if (errText) errDetail = errText.slice(0, 200);
        }
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
          if (abortController.signal.aborted) break;
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
    if (!abortController.signal.aborted) {
      return reply(res, 500, { error: err?.message || "Internal server error" });
    }
  } finally {
    res.off("close", closeHandler);
    active--;
  }
}

export function startAskBridge() {
  const server = createServer((req, res) => {
    void (async () => {
      const secret = process.env.ASK_WORKER_SECRET || credential("auth", "IMG_PROXY_SIGN_SECRET");
      if (!sameSecret(req.headers["x-worker-secret"] as string | undefined, secret)) {
        return reply(res, 403, { error: "Forbidden" });
      }

      // Honor the repository model safety switch and BYOK-specific toggle
      if (!config.modelCallsEnabled || process.env.BYOK_ENABLED === "false") {
        return reply(res, 503, { error: "Model calls or BYOK service are disabled" });
      }

      if (req.method === "POST" && req.url === "/ask-models") {
        return handleAskModels(req, res);
      }

      if (req.method === "POST" && req.url === "/ask") {
        return handleAskStream(req, res);
      }

      return reply(res, 404, { error: "Not found" });
    })().catch(() => {
      if (!res.headersSent) reply(res, 503, { error: "Service unavailable" });
      else res.destroy();
    });
  });

  server.listen(Number(process.env.ASK_WORKER_PORT || 3002), askWorkerHost());
  return server;
}
