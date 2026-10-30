import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { apiGet } from "../../lib/api.server";
import { pageMeta } from "../../lib/seo";
import type { PodcastEpisodeItem, PodcastChannelItem } from "@aihot/backend/publication/podcast";
import { PodcastEpisodeCard } from "../../components/podcast-episode-card";
import { PodcastPlayerBar } from "../../components/podcast-player-bar";
import { useIsPodcastFollowed, toggleFollowPodcast } from "../../lib/local-state";

interface LoaderData {
  channel: PodcastChannelItem | null;
  episodes: PodcastEpisodeItem[];
}

export async function loader({
  params,
  request,
}: {
  params: { slug?: string };
  request: Request;
}): Promise<LoaderData> {
  const slug = params.slug || "";
  const [channelsData, episodesData] = await Promise.all([
    apiGet<{ total: number; channels: PodcastChannelItem[] }>(
      "/api/site/podcast/channels",
      { request, signal: request.signal }
    ).catch(() => ({ total: 0, channels: [] })),
    apiGet<{ total: number; episodes: PodcastEpisodeItem[] }>(
      `/api/site/podcast/recommend?channelId=${encodeURIComponent(slug)}&limit=30`,
      { request, signal: request.signal }
    ).catch(() => ({ total: 0, episodes: [] })),
  ]);

  const channel =
    channelsData.channels.find((c) => c.slug === slug || c.id === slug) || null;

  return {
    channel,
    episodes: episodesData.episodes,
  };
}

export function meta({ matches, data }: { matches?: unknown; data: LoaderData }) {
  const title = data.channel ? `${data.channel.title} — Podcast 專頁` : "Podcast 頻道";
  return pageMeta({
    title,
    matches,
    description: data.channel?.description || "查看該 Podcast 頻道的最新單集與深度精選摘要。",
    path: `/podcast/channels/${data.channel?.slug || ""}`,
  });
}

export default function PodcastChannelDetailPage() {
  const { channel, episodes } = useLoaderData<typeof loader>();
  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisodeItem | null>(null);
  const isFollowed = useIsPodcastFollowed(channel?.id || "");

  if (!channel) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-ink">找不到該播客頻道</h2>
        <Link
          to="/podcast/channels"
          className="mt-4 inline-block text-xs font-semibold text-accent underline"
        >
          返回全部頻道目錄
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Channel Header Banner */}
      <div className="flex flex-col gap-6 rounded-2xl border border-line-soft bg-bg-card p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          {channel.coverUrl ? (
            <img
              src={channel.coverUrl}
              alt={channel.title}
              className="size-20 shrink-0 rounded-2xl object-cover border border-line-soft shadow-sm sm:size-24"
            />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-3xl sm:size-24">
              🎙️
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-[12px] font-semibold text-accent">
                {channel.category}
              </span>
              <span className="text-[15px] text-ink-4">共 {channel.episodeCount} 集</span>
            </div>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">
              {channel.title}
            </h1>
            {channel.followerClaim && (
              <p className="text-[15px] text-ink-3">
                ▶ {channel.followerClaim} 位追蹤者
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggleFollowPodcast(channel.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[15px] font-medium transition-all ${
              isFollowed
                ? "bg-ok-soft text-ok border border-ok/20 hover:bg-rose-500/10 hover:text-rose-500"
                : "bg-accent text-white shadow-xs hover:bg-accent/90"
            }`}
          >
            {isFollowed ? "已追蹤" : "+ 追蹤頻道"}
          </button>
        </div>
      </div>

      {/* Description */}
      {channel.description && (
        <div className="mt-4 rounded-xl border border-line-soft bg-bg-sunk/50 p-4 text-[16px] leading-[1.65] text-ink-3">
          {channel.description}
        </div>
      )}

      {/* Channel's Episodes Grid */}
      <div className="pt-8">
        <div className="border-b border-line-soft pb-3">
          <h2 className="text-base font-bold text-ink">收錄單集 ({episodes.length})</h2>
        </div>

        <div className="py-6">
          {episodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-soft p-12 text-center text-xs text-ink-3">
              該頻道目前暫無已分析推薦之單集。
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
      </div>

      {/* Floating Bottom Audio Player */}
      <PodcastPlayerBar
        episode={activeEpisode}
        onClose={() => setActiveEpisode(null)}
      />
    </div>
  );
}
