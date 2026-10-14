import type { FC } from "react";
import type { PodcastChannelItem } from "@aihot/backend/publication/podcast";
import { useIsPodcastFollowed, toggleFollowPodcast } from "../lib/local-state";
import { Link } from "react-router";

export interface PodcastChannelCardProps {
  channel: PodcastChannelItem;
}

export const PodcastChannelCard: FC<PodcastChannelCardProps> = ({ channel }) => {
  const isFollowed = useIsPodcastFollowed(channel.id);

  return (
    <div className="group relative flex items-center justify-between gap-3.5 rounded-xl border border-line-soft bg-bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-line hover:shadow-md">
      {/* Left: Avatar & Meta */}
      <Link
        to={`/podcast/channels/${channel.slug || channel.id}`}
        className="flex min-w-0 flex-1 items-center gap-3.5"
      >
        {channel.coverUrl ? (
          <img
            src={channel.coverUrl}
            alt={channel.title}
            className="size-12 shrink-0 rounded-full object-cover border border-line-soft shadow-xs"
            loading="lazy"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold text-accent">
            🎙️
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="truncate text-[17px] sm:text-[18px] font-bold text-ink group-hover:text-accent">
            {channel.title}
          </h3>
          <div className="flex items-center gap-2 text-[15px] text-ink-3">
            <span>共 {channel.episodeCount} 集</span>
            {channel.followerClaim && (
              <span className="flex items-center gap-1 font-mono text-ink-4 text-[15px]">
                <span className="text-red-500 text-[11px]">▶</span>
                {channel.followerClaim} 位追蹤者
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Right: + Follow / Subscribed Toggle Button */}
      <button
        type="button"
        onClick={() => toggleFollowPodcast(channel.id)}
        title={isFollowed ? "已追蹤（點擊取消）" : "追蹤頻道"}
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all ${
          isFollowed
            ? "bg-ok-soft text-ok hover:bg-rose-500/10 hover:text-rose-500"
            : "bg-amber-500 text-white hover:bg-amber-600 shadow-xs"
        }`}
      >
        {isFollowed ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
};
