// Forward reader-initiated BYOK requests to the worker without persisting or logging the key or prompt.
import type { FastifyInstance } from "fastify";
import { askWorkerUrl } from "@aihot/backend/lib/ask-network";
import { credential } from "@aihot/backend/config";

export function registerAskModel(app: FastifyInstance) {
  // Model inference proxy (streaming & non-streaming)
  app.post("/api/site/ask-model", { bodyLimit: 150_000, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = process.env.ASK_WORKER_SECRET || credential("auth", "IMG_PROXY_SIGN_SECRET");
    if (!secret) return reply.code(503).send({ error: "Worker authentication is not configured" });

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "Invalid request" });

    const abortController = new AbortController();
    const closeHandler = () => abortController.abort();
    req.raw.once("close", closeHandler);
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
        const value: unknown = await response.json().catch(() => ({ error: "Model request failed" }));
        return reply.code(response.status >= 400 && response.status < 600 ? response.status : 503).send(value);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          "x-accel-buffering": "no",
          connection: "keep-alive",
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
      req.log.warn("BYOK worker request failed");
      return reply.code(503).send({ error: "Worker unavailable" });
    } finally {
      req.raw.off("close", closeHandler);
      reply.raw.off("close", closeHandler);
    }
  });

  // Dynamic model list fetcher proxy
  app.post("/api/site/ask-models", { bodyLimit: 10_000, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = process.env.ASK_WORKER_SECRET || credential("auth", "IMG_PROXY_SIGN_SECRET");
    if (!secret) return reply.code(503).send({ error: "Worker authentication is not configured" });

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "Invalid request" });

    const abortController = new AbortController();
    const closeHandler = () => abortController.abort();
    req.raw.once("close", closeHandler);
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
        const value: unknown = await response.json().catch(() => ({ error: "Failed to fetch models" }));
        return reply.code(response.status >= 400 && response.status < 600 ? response.status : 503).send(value);
      }

      const value: unknown = await response.json();
      return reply.send(value);
    } catch (err) {
      if (abortController.signal.aborted) return;
      req.log.warn("BYOK worker models request failed");
      return reply.code(503).send({ error: "Worker unavailable" });
    } finally {
      req.raw.off("close", closeHandler);
      reply.raw.off("close", closeHandler);
    }
  });
}
