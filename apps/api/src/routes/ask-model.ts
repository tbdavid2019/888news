// Forward BYOK requests to the worker without persisting or logging the key or prompt.
import type { FastifyInstance } from "fastify";
import { askWorkerUrl } from "@aihot/backend/lib/ask-network";
import { credential } from "@aihot/backend/config";

export function registerAskModel(app: FastifyInstance) {
  app.post("/api/site/ask-model", { bodyLimit: 100_000, config: { rateLimit: { max: 15, timeWindow: "1 minute" } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = credential("auth", "IMG_PROXY_SIGN_SECRET");
    if (!secret) return reply.code(503).send({ error: "Worker authentication is not configured" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "Invalid request" });
    try {
      const endpoint = new URL("/ask", askWorkerUrl());
      const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(70_000), headers: { "content-type": "application/json", "x-worker-secret": secret }, body: JSON.stringify(body) });
      const value: unknown = await response.json();
      if (!response.ok) return reply.code(response.status >= 400 && response.status < 600 ? response.status : 503).send(value);
      return reply.send(value);
    } catch {
      req.log.warn("BYOK worker request failed");
      return reply.code(503).send({ error: "Worker unavailable" });
    }
  });
}
