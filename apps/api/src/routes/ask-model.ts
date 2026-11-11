// Forward reader-initiated BYOK and default companion requests to the worker without persisting or logging the key or prompt.
import type { FastifyInstance } from "fastify";
import { askWorkerUrl } from "@aihot/backend/lib/ask-network";
import { config, credential } from "@aihot/backend/config";
import { getAskQuota, consumeAskQuota, refundAskQuota, normalizeAskModel } from "@aihot/backend/publication/ask-quota";

export function registerAskModel(app: FastifyInstance) {
  // Query reader's daily quota status
  const quotaHandler = async (req: any, reply: any) => {
    reply.header("Cache-Control", "no-store");
    const fpHeader = req.headers["x-device-fingerprint"];
    const fpBody = req.body && typeof req.body === "object" ? req.body.fingerprint : null;
    const fp = typeof fpHeader === "string" ? fpHeader : (typeof fpBody === "string" ? fpBody : null);
    const quota = await getAskQuota(req.ip, fp);
    return reply.send({
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
      quotaExceeded: quota.quotaExceeded,
      hasDefaultKey: Boolean(config.defaultAskKey),
    });
  };

  app.get("/api/site/ask-quota", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, quotaHandler);
  app.post("/api/site/ask-quota", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, quotaHandler);

  // Model inference proxy (streaming & non-streaming)
  app.post("/api/site/ask-model", { bodyLimit: 150_000, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = process.env.ASK_WORKER_SECRET || credential("auth", "IMG_PROXY_SIGN_SECRET");
    if (!secret) return reply.code(503).send({ error: "Worker authentication is not configured" });

    const rawBody = req.body;
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return reply.code(400).send({ error: "Invalid request" });
    }
    const body = { ...(rawBody as Record<string, any>) };

    const rawKey = typeof body.key === "string" ? body.key.trim() : "";
    const isByok = Boolean(rawKey && rawKey !== "default");
    const fpHeader = req.headers["x-device-fingerprint"];
    const fingerprint = typeof fpHeader === "string" ? fpHeader : (typeof body.fingerprint === "string" ? body.fingerprint : null);

    let quotaRemaining: number | null = null;
    let didConsumeQuota = false;

    if (!isByok) {
      if (!config.defaultAskKey) {
        return reply.code(400).send({ error: "請先設定您的 API Key (BYOK)。" });
      }

      // Enforce daily quota: 6 questions/day per IP / device fingerprint (follow-ups count as 1)
      const quotaResult = await consumeAskQuota(req.ip, fingerprint);
      if (!quotaResult.allowed) {
        reply.header("X-Ask-Quota-Remaining", "0");
        return reply.code(429).send({
          error: "今日免費額度（6則）已用完，請設定您自己的 API Key (BYOK) 繼續發問。",
          quotaExceeded: true,
          limit: quotaResult.limit,
          remaining: 0,
        });
      }

      didConsumeQuota = true;
      quotaRemaining = quotaResult.remaining;
      body.provider = "custom";
      body.baseUrl = config.defaultAskBaseUrl;
      body.key = config.defaultAskKey;
      body.model = config.defaultAskModel;
    } else {
      // For BYOK, normalize only if model was specified
      body.model = normalizeAskModel(body.model, false) || body.model;
    }

    if (quotaRemaining !== null) {
      reply.header("X-Ask-Quota-Remaining", String(quotaRemaining));
    }

    const abortController = new AbortController();
    const closeHandler = () => {
      if (!reply.raw.writableEnded) abortController.abort();
    };
    reply.raw.once("close", closeHandler);

    try {
      const endpoint = new URL("/ask", askWorkerUrl());
      const timeoutSignal = AbortSignal.timeout(100_000);
      const combinedSignal = AbortSignal.any ? AbortSignal.any([abortController.signal, timeoutSignal]) : abortController.signal;

      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: combinedSignal,
        headers: { "content-type": "application/json", "x-worker-secret": secret },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // Refund quota on server/upstream failure so the user isn't penalized
        if (didConsumeQuota) {
          await refundAskQuota(req.ip, fingerprint);
          reply.removeHeader("X-Ask-Quota-Remaining");
        }
        const value: unknown = await response.json().catch(() => ({ error: "Model request failed" }));
        if (!isByok) {
          req.log.warn({ status: response.status }, "Default question service failed");
          return reply.code(503).send({ error: "問答服務暫時無法使用，請稍後再試；本次不扣除額度。" });
        }
        return reply.code(response.status >= 400 && response.status < 600 ? response.status : 503).send(value);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          "x-accel-buffering": "no",
          connection: "keep-alive",
          ...(quotaRemaining !== null ? { "x-ask-quota-remaining": String(quotaRemaining) } : {}),
        });
        if (response.body) {
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            if (abortController.signal.aborted) break;
            reply.raw.write(chunk);
          }
        }
        return reply.raw.end();
      }

      const value: unknown = await response.json();
      return reply.send(value);
    } catch (err) {
      if (abortController.signal.aborted) return;
      if (didConsumeQuota) {
        await refundAskQuota(req.ip, fingerprint);
        reply.removeHeader("X-Ask-Quota-Remaining");
      }
      req.log.warn("BYOK worker request failed");
      return reply.code(503).send({ error: "Worker unavailable" });
    } finally {
      reply.raw.off("close", closeHandler);
    }
  });

  // Dynamic model list fetcher proxy
  app.post("/api/site/ask-models", { bodyLimit: 10_000, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = process.env.ASK_WORKER_SECRET || credential("auth", "IMG_PROXY_SIGN_SECRET");
    if (!secret) return reply.code(503).send({ error: "Worker authentication is not configured" });

    const rawBody = req.body;
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return reply.code(400).send({ error: "Invalid request" });
    }
    const body = { ...(rawBody as Record<string, any>) };

    const rawKey = typeof body.key === "string" ? body.key.trim() : "";
    const isByok = Boolean(rawKey && rawKey !== "default");

    if (!isByok) {
      if (!config.defaultAskKey) {
        return reply.code(400).send({ error: "請先填寫 API Key" });
      }
      body.provider = "custom";
      body.baseUrl = config.defaultAskBaseUrl;
      body.key = config.defaultAskKey;
    }

    const abortController = new AbortController();
    const closeHandler = () => {
      if (!reply.raw.writableEnded) abortController.abort();
    };
    reply.raw.once("close", closeHandler);

    try {
      const endpoint = new URL("/ask-models", askWorkerUrl());
      const timeoutSignal = AbortSignal.timeout(20_000);
      const combinedSignal = AbortSignal.any ? AbortSignal.any([abortController.signal, timeoutSignal]) : abortController.signal;

      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: combinedSignal,
        headers: { "content-type": "application/json", "x-worker-secret": secret },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // Fallback for default provider
        if (!isByok) {
          return reply.send({ models: [config.defaultAskModel] });
        }
        const value: unknown = await response.json().catch(() => ({ error: "Failed to fetch models" }));
        return reply.code(response.status >= 400 && response.status < 600 ? response.status : 503).send(value);
      }

      const value: any = await response.json();
      if (!isByok && Array.isArray(value?.models)) {
        if (!value.models.includes(config.defaultAskModel)) {
          value.models.unshift(config.defaultAskModel);
        }
      }
      return reply.send(value);
    } catch (err) {
      if (abortController.signal.aborted) return;
      if (!isByok) {
        return reply.send({ models: [config.defaultAskModel] });
      }
      req.log.warn("BYOK worker models request failed");
      return reply.code(503).send({ error: "Worker unavailable" });
    } finally {
      reply.raw.off("close", closeHandler);
    }
  });
}
