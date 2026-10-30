import { useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { apiGet } from "../../lib/api.server";
import { pageMeta } from "../../lib/seo";
import { SITE } from "@aihot/industry/site";
import type { PodcastEpisodeItem } from "@aihot/backend/publication/podcast";
import { PodcastEntityRibbon } from "../../components/podcast-entity-ribbon";
import { PodcastEpisodeCard } from "../../components/podcast-episode-card";
import { PodcastPlayerBar } from "../../components/podcast-player-bar";

interface LoaderData {
  total: number;
  episodes: PodcastEpisodeItem[];
  tickers: Array<{ entityId: string; name: string; ticker: string; price: number; changePercent: number }>;
}

export async function loader({ request }: { request: Request }): Promise<LoaderData> {
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity") || "";
  const ticker = url.searchParams.get("ticker") || "";

  const query = new URLSearchParams();
  if (entity) query.set("entity", entity);
  if (ticker) query.set("ticker", ticker);
  query.set("limit", "36");

  const [episodesData, tickersData] = await Promise.all([
    apiGet<{ total: number; episodes: PodcastEpisodeItem[] }>(
      `/api/site/podcast/recommend?${query.toString()}`,
      { request, signal: request.signal }
    ).catch(() => ({ total: 0, episodes: [] })),
    apiGet<{ tickers: Array<{ entityId: string; name: string; ticker: string; price: number; changePercent: number }> }>(
      "/api/site/podcast/tickers",
      { request, signal: request.signal }
    ).catch(() => ({ tickers: [] })),
  ]);

  return {
    total: episodesData.total,
    episodes: episodesData.episodes,
    tickers: tickersData.tickers,
  };
}

export function meta({ matches }: { matches?: unknown }) {
  return pageMeta({
    title: "推薦 Podcast 單集",
    matches,
    description: `精選全球頂級科技、趨勢與商業 Podcast 單集，深度精華摘要與即時商業行情聯動。`,
    path: "/podcast/recommend",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" };
}

export default function PodcastRecommendPage() {
  const { total, episodes, tickers } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentEntity = searchParams.get("entity");
  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisodeItem | null>(null);

  const handleSelectEntity = (entityId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!entityId) {
      next.delete("entity");
    } else {
      next.set("entity", entityId);
    }
    setSearchParams(next);
  };

  const ribbonEntities = tickers.map((t) => ({ id: t.entityId, name: t.name }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Header & Navigation Tabs */}
      <div className="border-b border-line-soft pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Podcast 智庫推薦
            </h1>
            <p className="mt-1.5 text-[16px] leading-relaxed text-ink-3">
              收錄全球頂級科技、趨勢與商業頻道，深度精華摘要與上市公司即時行情聯動
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl bg-bg-sunk p-1 border border-line-soft text-[15px] font-medium">
            <Link
              to="/podcast/recommend"
              className="rounded-lg bg-bg-card px-4 py-2 text-ink shadow-xs transition-colors"
            >
              推薦單集
            </Link>
            <Link
              to="/podcast/channels"
              className="rounded-lg px-4 py-2 text-ink-3 hover:text-ink transition-colors"
            >
              全部頻道目錄
            </Link>
          </div>
        </div>

        {/* Horizontal Entity Filter Ribbon */}
        <div className="mt-4 pt-2">
          <PodcastEntityRibbon
            entities={ribbonEntities}
            selectedEntity={currentEntity}
            onSelect={handleSelectEntity}
          />
        </div>
      </div>

      {/* Main 3-Column Episode Grid */}
      <div className="py-6">
        {episodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-soft p-12 text-center">
            <span className="text-3xl">🎙️</span>
            <h3 className="mt-3 text-[18px] font-semibold text-ink">暫無相關單集</h3>
            <p className="mt-1 text-[16px] text-ink-3">
              目前篩選條件下沒有收錄的單集，請嘗試切換其他實體標籤。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <PodcastEpisodeCard
                key={ep.id}
                episode={ep}
                onPlay={(selected) => setActiveEpisode(selected)}
                isPlaying={activeEpisode?.id === ep.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Audio Player */}
      <PodcastPlayerBar
        episode={activeEpisode}
        onClose={() => setActiveEpisode(null)}
      />
    </div>
  );
}
