import { useState, useRef, useEffect, type FC } from "react";
import type { PodcastEpisodeItem } from "@aihot/backend/publication/podcast";

export interface PodcastPlayerBarProps {
  episode: PodcastEpisodeItem | null;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const PodcastPlayerBar: FC<PodcastPlayerBarProps> = ({ episode, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!episode || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [episode?.id]);

  if (!episode || !episode.audioUrl) return null;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSkip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-soft bg-bg-card/95 backdrop-blur-md px-4 py-2.5 shadow-2xl transition-all sm:px-6"
      role="region"
      aria-label="音訊播放器"
    >
      <audio
        ref={audioRef}
        src={episode.audioUrl || undefined}
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration || 0);
        }}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Left: Info */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {episode.podcastCoverUrl ? (
            <img
              src={episode.podcastCoverUrl}
              alt=""
              className="size-11 shrink-0 rounded-lg object-cover border border-line-soft shadow-xs"
            />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-base">
              🎙️
            </div>
          )}
          <div className="min-w-0">
            <h4 className="truncate text-xs font-semibold text-ink sm:text-sm">
              {episode.titleZh || episode.title}
            </h4>
            <p className="truncate text-[11px] text-ink-3">
              {episode.podcastTitle}
            </p>
          </div>
        </div>

        {/* Center: Controls & Slider */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-xl">
          <div className="flex items-center gap-3">
            {/* Skip -15s */}
            <button
              type="button"
              onClick={() => handleSkip(-15)}
              className="rounded-full p-1.5 text-ink-3 hover:bg-bg-sunk hover:text-ink transition-colors"
              title="倒轉 15 秒"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629v-2.34l6.945 3.968c1.25.714 2.805-.188 2.805-1.628V7.19c0-1.44-1.555-2.342-2.805-1.628L12 9.53V7.19c0-1.44-1.555-2.342-2.805-1.628L2.25 9.53a1.875 1.875 0 0 0 0 3.256l6.945 3.968c.08.046.166.083.254.113l-.254-.427Z" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="flex size-9 items-center justify-center rounded-full bg-accent text-white shadow-md hover:bg-accent/90 transition-transform active:scale-95"
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 translate-x-0.5">
                  <path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84z" />
                </svg>
              )}
            </button>

            {/* Skip +15s */}
            <button
              type="button"
              onClick={() => handleSkip(15)}
              className="rounded-full p-1.5 text-ink-3 hover:bg-bg-sunk hover:text-ink transition-colors"
              title="快轉 15 秒"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                <path d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628L12 14.47v2.342c0 1.44 1.555 2.343 2.805 1.628l6.945-3.969a1.875 1.875 0 0 0 0-3.256L14.805 7.25c-.08-.046-.166-.083-.254-.113l.254.427L12 9.53V7.19c0-1.44-1.555-2.343-2.805-1.628L5.055 7.06Z" />
              </svg>
            </button>

            {/* Speed Button */}
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className="rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-3 hover:bg-bg-sunk hover:text-ink border border-line-soft"
              title="切換播放倍速"
            >
              {playbackRate}x
            </button>
          </div>

          {/* Slider and Timers */}
          <div className="flex w-full items-center gap-2">
            <span className="font-mono text-[10px] text-ink-4 w-9 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-line-soft accent-accent"
            />
            <span className="font-mono text-[10px] text-ink-4 w-9">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right: Close button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-4 hover:bg-bg-sunk hover:text-ink transition-colors"
            title="關閉播放器"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
