import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { apiGet } from "../../lib/api.server";
import { pageMeta } from "../../lib/seo";
import type { PodcastChannelItem } from "@aihot/backend/publication/podcast";
import { PodcastChannelCard } from "../../components/podcast-channel-card";
import { useFollowedPodcasts } from "../../lib/local-state";

interface LoaderData {
  total: number;
  channels: PodcastChannelItem[];
}

export async function loader({ request }: { request: Request }): Promise<LoaderData> {
  const data = await apiGet<{ total: number; channels: PodcastChannelItem[] }>(
    "/api/site/podcast/channels",
    { request, signal: request.signal }
  ).catch(() => ({ total: 0, channels: [] }));

  return data;
}

export function meta() {
  return pageMeta({
    title: "Podcast 頻道目錄",
    description: "探索收錄之全球 100 個頂級科技、AI 與財經 Podcast 頻道，建立專屬追蹤清單。",
    path: "/podcast/channels",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=120, stale-while-revalidate=240" };
}

export default function PodcastChannelsPage() {
  const { total, channels } = useLoaderData<typeof loader>();
  const followedIds = useFollowedPodcasts();
  const [activeTab, setActiveTab] = useState<"all" | "followed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredChannels = channels.filter((c) => {
    if (activeTab === "followed" && !followedIds.includes(c.id)) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Header & Navigation Tabs */}
      <div className="border-b border-line-soft pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              全部 Podcast 頻道
            </h1>
            <p className="mt-1.5 text-[16px] leading-relaxed text-ink-3">
              精選收錄 {total} 個指標性科技與財經節目，一鍵追蹤建立專屬內容串流
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl bg-bg-sunk p-1 border border-line-soft text-[15px] font-medium">
            <Link
              to="/podcast/recommend"
              className="rounded-lg px-4 py-2 text-ink-3 hover:text-ink transition-colors"
            >
              推薦單集
            </Link>
            <Link
              to="/podcast/channels"
              className="rounded-lg bg-bg-card px-4 py-2 text-ink shadow-xs transition-colors"
            >
              全部頻道目錄
            </Link>
          </div>
        </div>

        {/* Filter Controls: Tabs & Search Input */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-3.5 py-2 text-[15px] font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-bg-sunk text-ink-3 hover:text-ink border border-line-soft"
              }`}
            >
              全部頻道 ({channels.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("followed")}
              className={`rounded-lg px-3.5 py-2 text-[15px] font-medium transition-colors ${
                activeTab === "followed"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-bg-sunk text-ink-3 hover:text-ink border border-line-soft"
              }`}
            >
              已追蹤頻道 ({followedIds.length})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="搜尋頻道名稱或簡介..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-line-soft bg-bg-card px-4 py-2 text-[15px] text-ink placeholder:text-ink-4 focus:border-accent focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* 3-Column Channels Grid */}
      <div className="py-6">
        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-soft p-12 text-center">
            <span className="text-3xl">📡</span>
            <h3 className="mt-3 text-[18px] font-semibold text-ink">
              {activeTab === "followed" ? "尚未追蹤任何頻道" : "找不到符合的頻道"}
            </h3>
            <p className="mt-1 text-[16px] text-ink-3">
              {activeTab === "followed"
                ? "點擊頻道右側的「+」按鈕，即可將感興趣的播客加入追蹤清單。"
                : "請嘗試搜尋其他關鍵字。"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredChannels.map((channel) => (
              <PodcastChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
