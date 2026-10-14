import type { FC } from "react";
import type { PodcastEpisodeItem } from "@aihot/backend/publication/podcast";
import { useIsPodcastEpisodeStarred, toggleStarPodcastEpisode } from "../lib/local-state";

export interface PodcastEpisodeCardProps {
  episode: PodcastEpisodeItem;
  onPlay?: (episode: PodcastEpisodeItem) => void;
  isPlaying?: boolean;
}

export const PodcastEpisodeCard: FC<PodcastEpisodeCardProps> = ({
  episode,
  onPlay,
  isPlaying = false,
}) => {
  const isStarred = useIsPodcastEpisodeStarred(episode.id);

  const displayTitle = episode.titleZh || episode.title;

  const formatPerson = (p: unknown): string => {
    if (!p) return "";
    if (typeof p === "string") return p;
    if (typeof p === "object" && p !== null) return (p as Record<string, unknown>).name as string || (p as Record<string, unknown>).title as string || "";
    return String(p);
  };

  const hosts = (episode.hosts || []).map(formatPerson).filter(Boolean);
  const guests = (episode.guests || []).map(formatPerson).filter(Boolean);
  const hostsText = hosts.length > 0 ? `Host: ${hosts.join(", ")}` : "";
  const guestsText = guests.length > 0 ? `Guest: ${guests.join(", ")}` : "";
  const speakersText = [hostsText, guestsText].filter(Boolean).join(" · ");

  return (
    <article className="group relative flex flex-col justify-between rounded-xl border border-line-soft bg-bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-line hover:shadow-md">
      {/* Top Header: Channel Attribution & Actions */}
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {episode.podcastCoverUrl ? (
            <img
              src={episode.podcastCoverUrl}
              alt={episode.podcastTitle}
              className="size-7 shrink-0 rounded-md object-cover border border-line-soft"
              loading="lazy"
            />
          ) : (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent">
              🎙️
            </div>
          )}
          <span className="truncate text-xs font-medium text-ink-2 group-hover:text-ink">
            {episode.podcastTitle}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => toggleStarPodcastEpisode(episode.id)}
            title={isStarred ? "取消收藏" : "收藏單集"}
            className={`p-1 rounded-md transition-colors ${
              isStarred ? "text-amber-ink hover:text-amber-600" : "text-ink-4 hover:text-ink-2"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill={isStarred ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
              className="size-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
              />
            </svg>
          </button>

          <a
            href={episode.url || episode.audioUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            title={episode.url?.includes("youtube") ? "在 YouTube 開啟原文" : "開啟原文連結"}
            className="p-1 rounded-md text-ink-4 transition-colors hover:text-ink-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
              className="size-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      </div>

      {/* Main Body: Title, Speakers, TL;DR */}
      <div className="flex-1 space-y-2.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-accent">
          <a
            href={episode.url || episode.audioUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {displayTitle}
          </a>
        </h3>

        {speakersText && (
          <p className="line-clamp-1 text-xs text-ink-3">
            {speakersText}
          </p>
        )}

        {episode.summaryZh && (
          <p className="line-clamp-3 text-xs leading-relaxed text-ink-2">
            {episode.summaryZh}
          </p>
        )}

        {/* Discussion Topic Pills */}
        {episode.keyPoints && episode.keyPoints.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {episode.keyPoints.slice(0, 3).map((kp, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-md bg-bg-sunk px-2 py-0.5 text-[11px] font-normal text-ink-3 border border-line-soft/60"
              >
                {kp}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Meta & Stock Badges */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft/60 pt-3 text-xs text-ink-3">
        <div className="flex items-center gap-2">
          {onPlay && episode.audioUrl ? (
            <button
              type="button"
              onClick={() => onPlay(episode)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isPlaying
                  ? "bg-accent text-white"
                  : "bg-accent-soft text-accent hover:bg-accent hover:text-white"
              }`}
            >
              {isPlaying ? (
                <>
                  <span className="size-2 rounded-full bg-white animate-pulse" />
                  播放中
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-3"
                  >
                    <path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84z" />
                  </svg>
                  收聽
                </>
              )}
            </button>
          ) : episode.url ? (
            <a
              href={episode.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-bg-sunk text-ink-3 hover:bg-accent hover:text-white transition-colors border border-line-soft"
              title={episode.url.includes("youtube") ? "在 YouTube 開啟收看" : "開啟原文連結"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-3"
              >
                <path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84z" />
              </svg>
              {episode.url.includes("youtube") ? "收看" : "收聽"}
            </a>
          ) : null}

          {episode.audioDurationStr && (
            <span className="font-mono text-[11px] text-ink-4">
              {episode.audioDurationStr}
            </span>
          )}

          {episode.language && (
            <span className="rounded bg-bg-sunk px-1.5 py-0.5 text-[10px] font-medium text-ink-4 border border-line-soft">
              {episode.language}
            </span>
          )}
        </div>

        {/* Financial Tickers Badges */}
        {episode.tickers && episode.tickers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {episode.tickers.slice(0, 3).map((st) => {
              const isPositive = st.changePercent >= 0;
              return (
                <span
                  key={st.ticker}
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${
                    isPositive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  }`}
                >
                  <span>{st.ticker}</span>
                  <span>{isPositive ? "↑" : "↓"}</span>
                  <span>{Math.abs(st.changePercent).toFixed(2)}%</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
};
