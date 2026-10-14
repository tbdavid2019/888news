import type { FC } from "react";

export interface PodcastEntityRibbonProps {
  entities: Array<{ id: string; name: string }>;
  selectedEntity: string | null;
  onSelect: (entityId: string | null) => void;
  className?: string;
}

export const DEFAULT_PODCAST_ENTITIES: Array<{ id: string; name: string }> = [
  { id: "claude", name: "Claude" },
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "nvidia", name: "NVIDIA" },
  { id: "google", name: "Google" },
  { id: "meta", name: "Meta" },
  { id: "microsoft", name: "Microsoft" },
  { id: "tsmc", name: "台積電" },
  { id: "cursor", name: "Cursor" },
  { id: "amazon", name: "Amazon" },
  { id: "apple", name: "Apple" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "xai", name: "xAI" },
  { id: "meituan", name: "美團" },
  { id: "pdd", name: "拼多多" },
];

export const PodcastEntityRibbon: FC<PodcastEntityRibbonProps> = ({
  entities = DEFAULT_PODCAST_ENTITIES,
  selectedEntity,
  onSelect,
  className = "",
}) => {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      role="region"
      aria-label="Podcast 實體快捷篩選"
    >
      <div className="flex w-full items-center gap-2 overflow-x-auto py-2.5 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            selectedEntity === null
              ? "bg-accent text-white shadow-sm ring-2 ring-accent/30"
              : "border border-line-soft bg-bg-sunk text-ink-2 hover:border-line hover:bg-bg-subtle hover:text-ink"
          }`}
        >
          全部
        </button>

        {entities.map((item) => {
          const isActive = selectedEntity === item.id || selectedEntity === item.name;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(isActive ? null : item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-accent text-white shadow-sm ring-2 ring-accent/30"
                  : "border border-line-soft bg-bg-sunk text-ink-2 hover:border-line hover:bg-bg-subtle hover:text-ink"
              }`}
            >
              {item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
