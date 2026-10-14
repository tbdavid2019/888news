// Podcast site API endpoints (/api/site/podcast/*).
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  loadPodcastChannels,
  loadPodcastRecommend,
  loadPodcastTickers,
} from "@aihot/backend/publication/podcast";
import { sendJsonWithEtag } from "../http/respond.ts";

export function registerPodcast(app: FastifyInstance) {
  // GET /api/site/podcast/recommend
  app.get("/api/site/podcast/recommend", async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string | undefined>;
    const entity = q.entity?.trim() || null;
    const ticker = q.ticker?.trim() || null;
    const channelId = q.channelId?.trim() || null;
    const limit = Number.parseInt(String(q.limit ?? "24"), 10) || 24;
    const offset = Number.parseInt(String(q.offset ?? "0"), 10) || 0;

    const data = await loadPodcastRecommend({
      entity,
      ticker,
      channelId,
      limit,
      offset,
    });

    return sendJsonWithEtag(req, reply, data, {
      etagPrefix: "podcast-recommend",
      cacheControl: "public, max-age=60, s-maxage=60",
    });
  });

  // GET /api/site/podcast/channels
  app.get("/api/site/podcast/channels", async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string | undefined>;
    const search = q.q?.trim() || null;
    const category = q.category?.trim() || null;

    const data = await loadPodcastChannels({
      q: search,
      category,
    });

    return sendJsonWithEtag(req, reply, data, {
      etagPrefix: "podcast-channels",
      cacheControl: "public, max-age=120, s-maxage=120",
    });
  });

  // GET /api/site/podcast/tickers
  app.get("/api/site/podcast/tickers", async (req: FastifyRequest, reply: FastifyReply) => {
    const tickers = await loadPodcastTickers();
    return sendJsonWithEtag(req, reply, { tickers }, {
      etagPrefix: "podcast-tickers",
      cacheControl: "public, max-age=60, s-maxage=60",
    });
  });
}
