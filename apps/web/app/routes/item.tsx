import { SITE, withSubject } from "@aihot/industry/site";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/item";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { fullDateTime, relativeTime } from "../lib/format";
import { markRead } from "../lib/local-state";
import { useI18n } from "../lib/i18n";
import { formatArticleSummary, renderMarkdown } from "../lib/markdown";
import { SelectedBadge } from "../components/ui/Badge";
import { ScoreLabel } from "../components/ui/Score";
import { PillTabs } from "../components/ui/Tabs";
import { ArticleLayout, RailSection } from "../components/ui/Page";
import { Menu, MenuItem } from "../components/ui/Menu";
import { StarButton } from "../features/feed/parts";
import { GroupSources } from "../features/feed/ReadingGroup";
import { StoryFollowups } from "../features/item/StoryFollowups";
import { MediaGallery } from "../features/item/MediaGallery";
import { QuotedPost } from "../features/item/QuotedPost";
import { TweetCard } from "../features/item/TweetCard";
import { IconArrowLeft, IconCopy, IconDownload, IconExternal, IconImage, IconMenu, IconShare } from "../components/icons";

const PosterSheet = lazy(() => import("../features/item/PosterSheet"));

export async function loader({ params, request }: Route.LoaderArgs) {
  const item = await loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.id)}`, { request, signal: request.signal });
  return { item };
}


export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("內容不存在") }, { name: "robots", content: "noindex" }];
  const { item } = loaderData;
  return pageMeta({
    title: item.title,
    description: item.summary ?? undefined,
    path: `/items/${item.id}`,
    image: `/og/items/${item.id}.png`,
    type: "article",
    noindex: !item.indexable,
    jsonLd: breadcrumbLd([
      { name: SITE.name, path: "/" },
      { name: item.selected ? "精選" : "全部動態", path: item.selected ? "/" : "/all" },
      { name: item.title, path: `/items/${item.id}` },
    ]),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=120" };
}

/** A 2px accent line across the top that follows long bodies. */
function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return <div ref={ref} aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left scale-x-0 bg-accent transition-transform duration-150 ease-out" />;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function shareOrCopy(item: Pick<SiteItemDetail, "id" | "title">): Promise<"shared" | "copied" | null> {
  const url = `${siteUrl()}/items/${item.id}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: item.title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${item.title}\n${url}`);
    return "copied";
  } catch {
    return null;
  }
}

export default function ItemPage() {
  const { item } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const hasTranslation = item.hasTranslation;
  const lang = item.bodyLanguage;
  const [posterRequested, setPosterRequested] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => markRead(item.id), [item.id]);
  useEffect(() => {
    if (!toast) return;
    const tTimer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(tTimer);
  }, [toast]);
  const closePoster = useCallback(() => setPosterOpen(false), []);
  const openPoster = () => {
    setPosterRequested(true);
    setPosterOpen(true);
  };
  const share = async () => {
    const r = await shareOrCopy(item);
    if (r === "copied") setToast(t("item.link_copied"));
  };

  const bodyHtml = lang === "zh" ? (item.body?.zh ?? item.body?.original) : (item.body?.original ?? item.body?.zh);
  const bodyLabel = !item.body ? null : lang === "zh" && item.body.zhKind === "translation" ? t("item.body_translation") : lang === "original" && hasTranslation ? t("item.body_original") : t("item.body");
  const isX = item.channel === "x" && !!item.x;
  const publishedIso = item.publishedAt ?? item.discoveredAt;
  const summaryOnly = item.readingMode === "summary-only";
  const showOutline = item.outline.length >= 3;
  const originalLabel = isX ? t("item.view_on_x") : t("item.open_original");

  const related = item.relatedStories.filter((s) => s.publicId !== item.story?.publicId);

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(item.selected ? "/" : "/all");
  };
  const backButton = (
    <button type="button" onClick={back} className="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-full px-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink lg:text-[13px] lg:text-ink-3">
      <IconArrowLeft size={16} /> {t("item.back")}
    </button>
  );
  const moreMenu = (
    <Menu label={t("item.more_actions")} trigger={<IconMenu size={17} />}>
      {(close) => (
        <>
          <MenuItem icon={<IconShare size={15} />} onSelect={() => { close(); void share(); }}>{t("item.share_link")}</MenuItem>
          <MenuItem icon={<IconImage size={15} />} onSelect={() => { close(); openPoster(); }}>{t("item.generate_poster")}</MenuItem>
          <MenuItem
            icon={<IconCopy size={15} />}
            onSelect={async () => {
              close();
              try {
                await navigator.clipboard.writeText(`${siteUrl()}/items/${item.id}`);
                setToast(t("item.link_copied"));
              } catch {
                // clipboard unavailable
              }
            }}
          >
            {t("item.copy_link")}
          </MenuItem>
          {item.markdownAvailable && (
            <MenuItem icon={<IconDownload size={15} />} href={`/items/${item.id}/markdown`} download onSelect={close}>
              {t("item.export_markdown")}
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
  // Desktop actions head the right rail, one row as tall as 返回 at the head of the left one.
  const actions = (
    <div className="flex items-center gap-1">
      <a
        href={item.links.original}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
      >
        {originalLabel} <IconExternal size={13} />
      </a>
      <StarButton item={item} size={32} />
      {moreMenu}
    </div>
  );
  const verdict = (item.selected || item.score !== null) && (
    <div className="flex items-center gap-2">
      {item.selected && <SelectedBadge />}
      <ScoreLabel score={item.score} />
    </div>
  );

  // Rails: the piece's facts on the left (wide screens), the editor's notes on the right, the outline
  // under the facts (or under the notes when only the right rail shows).
  const facts = (
    <RailSection title={t("item.source")}>
      <a
        href={item.links.original}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-1.5 text-[15px] font-bold leading-snug text-ink hover:text-accent transition-colors"
      >
        <span>{isX ? item.x!.authorName : item.source.name}</span>
        <IconExternal size={13} className="text-ink-4 group-hover:text-accent shrink-0" />
      </a>
      <a
        href={item.links.original}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block text-[13px] leading-relaxed text-ink-3 hover:text-accent hover:underline break-all"
      >
        {isX ? `@${item.x!.handle} · 在 X 檢視` : item.author ? `${item.author} · ${hostOf(item.links.original)}` : hostOf(item.links.original)}
      </a>
      <div className="mt-3 text-[12px] text-ink-4">{t("item.published_at")}</div>
      <time dateTime={publishedIso} className="mono mt-0.5 block text-[12.5px] text-ink-2">
        {fullDateTime(publishedIso)}
      </time>
      <div className="mt-0.5 text-[12px] text-ink-4" suppressHydrationWarning>
        {relativeTime(publishedIso, locale)}
      </div>
    </RailSection>
  );
  const outline = showOutline && (
    <RailSection title={t("item.outline")}>
      <nav aria-label={t("item.outline")}>
        <ol className="-ml-px space-y-0.5 border-l border-line">
          {item.outline.map((o) => (
            <li key={o.id}>
              <a href={`#${o.id}`} className={`-ml-px block border-l border-transparent py-1 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink ${o.level > 2 ? "pl-5" : "pl-3"}`}>
                {o.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </RailSection>
  );
  const notes = (
    <>
      {item.reason && !summaryOnly ? (
        <RailSection title={t("item.why_recommended")}>
          {verdict && <div className="mb-3">{verdict}</div>}
          <div
            className="prose prose-compact text-[13.5px] leading-[1.8] text-ink-2"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(item.reason, siteUrl()).html }}
          />
        </RailSection>
      ) : (
        verdict && <RailSection title={t("feed.ai_score")}>{verdict}</RailSection>
      )}
      {item.tags.length > 0 && (
        <RailSection title={t("item.tags")}>
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 8).map((t) => (
              <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                #{t}
              </Link>
            ))}
          </div>
        </RailSection>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      {item.body && <ReadingProgress />}

      {/* Phones: a sticky bar with back, 收藏, the original, share and more. Desktop puts these in the rails. */}
      <div className="sticky top-0 z-30 -mx-4 flex h-12 items-center gap-1.5 border-b border-line-soft bg-bg/95 px-4 backdrop-blur lg:hidden">
        {backButton}
        <span className="flex-1" />
        <StarButton item={item} size={32} />
        <a href={item.links.original} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 px-1.5 text-[14px] text-ink-2">
          <IconExternal size={15} /> {originalLabel}
        </a>
        <button type="button" aria-label={t("item.share")} onClick={share} className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:text-ink">
          <IconShare size={17} />
        </button>
        {moreMenu}
      </div>

      {/* The text on the page in one column; back and the facts in the left rail, actions and notes in the right. */}
      <ArticleLayout
        left={
          <>
            {backButton}
            {facts}
            {outline}
          </>
        }
        right={
          <>
            {actions}
            {notes}
            <div className="space-y-8 2xl:hidden">{outline}</div>
          </>
        }
      >
        <div className="hidden lg:block 2xl:hidden">{backButton}</div>
        <article className="pb-6 pt-6 lg:pt-2 2xl:pt-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <a
              href={item.links.original}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1 text-[13px] font-medium text-ink-2 shadow-2xs hover:border-accent hover:text-accent transition-colors"
              title={isX ? "在 X (Twitter) 檢視原始推文" : `前往 ${item.source.name} 閱讀原文`}
            >
              {item.source.iconUrl && !isX && (
                <img src={item.source.iconUrl} alt="" className="size-3.5 rounded-full object-cover shrink-0" />
              )}
              <span>{isX ? `𝕏 ${item.x!.authorName}` : item.source.name}</span>
              <span className="font-mono text-[12px] text-ink-4">({hostOf(item.links.original)})</span>
              <IconExternal size={11} className="shrink-0 text-ink-4 group-hover:text-accent" />
            </a>
            {item.author && !isX && <span className="text-[13px] text-ink-3">· {item.author}</span>}
            <span className="text-ink-4">·</span>
            <time dateTime={publishedIso} className="mono text-[12.5px] text-ink-3">{fullDateTime(publishedIso)}</time>
            <span className="text-[12px] text-ink-4" suppressHydrationWarning>· {relativeTime(publishedIso, locale)}</span>
            {item.selected && (
              <span className="ml-1 lg:hidden">
                <SelectedBadge />
              </span>
            )}
            {item.score !== null && (
              <span className="ml-1 lg:hidden">
                <ScoreLabel score={item.score} />
              </span>
            )}
          </div>
          {!isX && <h1 className="text-[26px] font-bold leading-[1.38] tracking-[-0.01em] text-ink lg:text-[32px] lg:leading-[1.34] xl:text-[36px] xl:leading-[1.3]">{item.title}</h1>}
          {!isX && item.originalTitle && <p className="mt-2.5 text-[14px] leading-relaxed text-ink-4">{item.originalTitle}</p>}

          {item.summary && (
            <section className={isX ? "mt-4" : "mt-7 xl:mt-8"}>
              <div className="mb-2 text-[12px] font-semibold text-accent">{summaryOnly ? t("item.summary") : t("item.summary_lead")}</div>
              <div
                className="prose prose-summary"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(formatArticleSummary(item.summary), siteUrl()).html }}
              />
            </section>
          )}

          {item.tags.includes("Podcast") && (
            <div className="mt-6 rounded-2xl border border-line-soft bg-bg-card p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-2xl text-accent">
                    🎙️
                  </div>
                  <div>
                    <h4 className="text-[16px] font-bold text-ink">Podcast 專家音訊節目</h4>
                    <p className="text-[14px] text-ink-3">收錄於 888news Podcast 智庫專區，包含精華摘要與上市公司即時行情</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/podcast/recommend"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors"
                  >
                    前往 Podcast 智庫
                  </Link>
                </div>
              </div>
            </div>
          )}

          {item.reason && !summaryOnly && (
            <section className="mt-6 border-t border-line pt-4 lg:hidden">
              <div className="mb-1 text-[12px] font-semibold text-ink-3">{t("item.why_recommended")}</div>
              <div
                className="prose prose-compact text-[14.5px] leading-[1.75] text-ink-2"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.reason, siteUrl()).html }}
              />
            </section>
          )}

          {item.group && item.group.reportCount > 1 && (
            <div className="mt-5">
              <GroupSources group={item.group} parentId={item.id} />
            </div>
          )}

          {/* Non-X article without embedded fulltext: prominent "Read Original" card */}
          {!item.body && !isX && (
            <div className="mt-8 rounded-2xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-accent/10 px-2.5 py-0.5 text-[12px] font-semibold text-accent">
                      信源出處
                    </span>
                    <span className="text-[13px] text-ink-4 font-mono">{hostOf(item.links.original)}</span>
                  </div>
                  <h4 className="text-[17px] sm:text-[18px] font-bold text-ink leading-snug">
                    {item.originalTitle || item.title}
                  </h4>
                  <p className="text-[14.5px] text-ink-3 leading-relaxed">
                    本文為 888news AI 精選之重點導讀。若需閱讀作者完整原文、技術細節與官方討論，請前往原始網站。
                  </p>
                </div>
                <a
                  href={item.links.original}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14.5px] font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <span>{originalLabel}</span>
                  <IconExternal size={15} />
                </a>
              </div>
            </div>
          )}

          {/* Dedicated Tweet presentation for X posts */}
          {isX && (
            <TweetCard item={item} bodyHtml={bodyHtml} lang={lang} />
          )}

          {/* Standard Article Body for non-X long-form articles */}
          {!isX && item.body && bodyHtml && (
            <section className="mt-9 border-t border-line pt-4 xl:mt-10">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-4">{bodyLabel}</span>
                {hasTranslation && (
                  <PillTabs
                    size="xs"
                    layoutId="item-body-lang"
                    label={t("item.body_lang")}
                    active={lang}
                    items={[
                      { key: "zh", label: t("item.lang_zh"), prefetch: "intent", replace: true, to: `/items/${item.id}` },
                      { key: "original", label: t("item.lang_original"), prefetch: "intent", replace: true, to: `/items/${item.id}/original` },
                    ]}
                  />
                )}
              </div>
              {hasTranslation && lang === "zh" && !item.body.complete && (
                <p className="mb-5 rounded-control bg-bg-sunk px-3 py-2 text-[13px] text-ink-3">{t("item.body_incomplete")}</p>
              )}
              <div className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </section>
          )}

          {/* Prominent Footer Source Attribution */}
          <div className="mt-10 pt-5 border-t border-line flex flex-wrap items-center justify-between gap-4">
            <div className="text-[14px] text-ink-3">
              {t("item.source_attribution")}{" "}
              <a href={item.links.original} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-accent underline underline-offset-4 decoration-line">
                {isX ? item.x!.authorName : item.source.name}
              </a>
              <span className="text-ink-4"> ({hostOf(item.links.original)})</span>
            </div>
            <a
              href={item.links.original}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-[13.5px] font-medium text-ink-2 hover:border-accent hover:text-accent shadow-2xs transition-colors"
            >
              <span>{originalLabel}</span>
              <IconExternal size={14} />
            </a>
          </div>

          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 lg:hidden">
              {item.tags.slice(0, 6).map((tName) => (
                <Link key={tName} to={`/all?tag=${encodeURIComponent(tName)}`} className="chip">
                  #{tName}
                </Link>
              ))}
            </div>
          )}

          {item.story && <StoryFollowups story={item.story} currentId={item.id} />}

          {related.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-[14px] font-semibold text-ink">{t("item.related_stories")}</h2>
              <ul className="divide-y divide-line-soft">
                {related.map((s) => (
                  <li key={s.publicId}>
                    <Link to={`/story/${s.publicId}`} className="block py-2.5 text-[14px] text-ink-2 hover:text-accent">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </ArticleLayout>

      {posterRequested && (
        <Suspense fallback={null}>
          <PosterSheet id={item.id} title={item.title} open={posterOpen} onClose={closePoster} />
        </Suspense>
      )}
      {toast && (
        <div role="status" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-bg shadow-[var(--shadow-pop)] lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}
