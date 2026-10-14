import type { SiteItemDetail } from "@aihot/contracts/site";
import { fullDateTime, relativeTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { IconArrowUpRight, IconExternal } from "../../components/icons";
import { MediaGallery } from "./MediaGallery";
import { QuotedPost } from "./QuotedPost";
import { PillTabs } from "../../components/ui/Tabs";

interface TweetCardProps {
  item: SiteItemDetail;
  bodyHtml?: string | null;
  lang: "zh" | "original";
}

export function TweetCard({ item, bodyHtml, lang }: TweetCardProps) {
  const { locale, t } = useI18n();
  const x = item.x;
  if (!x) return null;

  const publishedIso = item.publishedAt ?? item.discoveredAt;

  return (
    <div className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs">
      {/* Tweet Author & Header */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-line-soft">
        <div className="flex items-center gap-3 min-w-0">
          {x.avatarUrl ? (
            <img
              src={x.avatarUrl}
              srcSet={x.avatarSrcSet}
              alt={x.authorName}
              className="size-11 sm:size-12 rounded-full border border-line object-cover shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="flex size-11 sm:size-12 items-center justify-center rounded-full bg-accent/10 font-bold text-accent text-lg shrink-0">
              {x.authorName?.[0] || "𝕏"}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[16px] sm:text-[17px] text-ink truncate leading-tight">
                {x.authorName}
              </span>
              <span className="text-[13.5px] text-ink-4 shrink-0 font-mono">
                @{x.handle}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-ink-4 mt-0.5" suppressHydrationWarning>
              <time dateTime={publishedIso} className="mono">
                {fullDateTime(publishedIso)}
              </time>
              <span>·</span>
              <span>{relativeTime(publishedIso, locale)}</span>
            </div>
          </div>
        </div>

        {/* Action Link to X */}
        <a
          href={item.links.original}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-bg-sunk/60 px-3.5 py-1.5 text-[13px] font-medium text-ink-2 hover:border-ink hover:text-ink hover:bg-bg transition-colors shadow-2xs"
          title="在 X (Twitter) 開啟原始推文"
        >
          <span className="font-semibold">𝕏</span>
          <span className="hidden sm:inline">檢視原文</span>
          <IconExternal size={13} className="text-ink-4" />
        </a>
      </div>

      {/* Language Switcher if Translation is available */}
      {item.hasTranslation && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-ink-4">
            {lang === "zh" ? "正體中文翻譯" : "原文內容 (English)"}
          </span>
          <PillTabs
            size="xs"
            layoutId="tweet-body-lang"
            label={t("item.body_lang")}
            active={lang}
            items={[
              { key: "zh", label: t("item.lang_zh"), prefetch: "intent", replace: true, to: `/items/${item.id}` },
              { key: "original", label: t("item.lang_original"), prefetch: "intent", replace: true, to: `/items/${item.id}/original` },
            ]}
          />
        </div>
      )}

      {/* Tweet Body Content */}
      {bodyHtml ? (
        <div
          className="mt-4 text-[17px] sm:text-[18px] leading-[1.7] text-ink font-normal break-words selection:bg-accent/20"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : null}

      {/* Tweet Attached Media */}
      {x.media && x.media.length > 0 && (
        <div className="mt-5">
          <MediaGallery media={x.media} postUrl={item.links.original} />
        </div>
      )}

      {/* Quoted Tweet */}
      {x.quoted && x.quoted.text && (
        <div className="mt-5">
          <QuotedPost quoted={x.quoted} original={lang === "original"} />
        </div>
      )}

      {/* Card Footer Link */}
      <div className="mt-6 pt-4 border-t border-line-soft flex items-center justify-between text-[13px] text-ink-4">
        <span>推文來源 · X (Twitter)</span>
        <a
          href={item.links.original}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent hover:text-accent-ink hover:underline font-medium"
        >
          <span>在 X 參與討論</span>
          <IconArrowUpRight size={13} />
        </a>
      </div>
    </div>
  );
}
