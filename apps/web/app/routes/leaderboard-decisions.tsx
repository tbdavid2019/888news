import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/leaderboard-decisions";
import type { LbDecisionsBoardResponse } from "@aihot/contracts/leaderboard";
import { SITE } from "@aihot/industry/site";
import { IconArrowUpRight } from "../components/icons";
import { formatRequestsCount, modelHref, shortStamp } from "../features/leaderboard/format";
import { edgeTtl, loadOr404 } from "../lib/api.server";
import { useEntrance } from "../lib/hydration";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";

export async function loader({ request }: Route.LoaderArgs) {
  return loadOr404<LbDecisionsBoardResponse>("/api/site/leaderboard/decisions", { request, signal: request.signal });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("決策模型參考榜") }];
  const path = "/leaderboard/decisions";
  return pageMeta({
    title: titled("決策模型參考榜"),
    rawTitle: true,
    matches,
    description: `追蹤 OpenRouter Decision Models 真實生產環境請求量排行，展示分類、路由與結構化決策專用模型的市場熱度（僅作參考，不進 ${SITE.name} 能力總分）。`,
    path,
    image: "/og/pages/leaderboard.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `${SITE.name} 決策模型參考榜`,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: loaderData.entries.length,
        itemListElement: loaderData.entries.map((e) => ({
          "@type": "ListItem",
          position: e.rank,
          name: e.id,
          url: e.modelSlug ? `${siteUrl()}${modelHref(e.modelSlug)}` : loaderData.sourceUrl,
        })),
      },
      breadcrumbLd([
        { name: "模型榜", path: "/leaderboard" },
        { name: "決策模型", path },
      ]),
    ],
  });
}

export function headers() {
  return edgeTtl(600);
}

export default function LeaderboardDecisionsPage() {
  const { updatedAt, sourceName, sourceUrl, license, licenseUrl, entries } = useLoaderData<typeof loader>();
  const entrance = useEntrance();

  return (
    <div key="decisions" className={entrance ? "animate-fade-up" : undefined}>
      <div className="mt-3 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[13.5px] text-ink-2">
          依 OpenRouter 最近完整一週（Weekly）生產請求量排序的決策與分類模型（Decision Models），僅作市場熱度參考，不計入模型能力共識分數。
        </p>
        <p className="num text-[12px] text-ink-4">
          來源：{sourceName}
          <span className="mx-2">·</span>
          {updatedAt ? `${shortStamp(updatedAt)} 同步` : "等待同步"}
        </p>
      </div>

      <section className="card mt-3 overflow-hidden" aria-labelledby="lb-decisions-title">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 lg:px-[22px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="lb-decisions-title" className="text-[16px] font-bold text-ink">
              決策模型參考榜
            </h2>
            <span className="mono text-[11px] font-normal tracking-wide text-ink-4">{entries.length} 個模型</span>
            <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-3">
              參考指標 · 不計入總分
            </span>
          </div>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
          >
            OpenRouter 原始榜單 <IconArrowUpRight size={13} />
          </a>
        </div>

        {entries.length === 0 ? (
          <div className="border-t border-line px-4 py-12 text-center text-[13.5px] text-ink-3 lg:px-[22px]">
            尚無決策模型排行資料，等待排程同步。
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface/60 text-[12px] text-ink-3">
                  <th scope="col" className="w-16 px-4 py-2.5 font-medium lg:px-[22px]">名次</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">模型</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">機構 / 作者</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">每週請求量</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell lg:px-[22px]">週變化</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((entry) => (
                  <tr key={`${entry.openrouterRank}-${entry.name}`} className="transition-colors hover:bg-surface/60">
                    <td className="px-4 py-3 lg:px-[22px]">
                      <span className="mono text-[13px] text-ink-4">{String(entry.rank).padStart(2, "0")}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        {entry.modelSlug ? (
                          <Link
                            viewTransition
                            to={modelHref(entry.modelSlug)}
                            className="text-[14px] font-medium text-ink transition-colors hover:text-accent"
                          >
                            {entry.name}
                          </Link>
                        ) : (
                          <span className="text-[14px] font-medium text-ink">{entry.name}</span>
                        )}
                        {entry.author && (
                          <span className="mono mt-0.5 text-[11.5px] text-ink-4 sm:hidden">{entry.author}</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-[13px] text-ink-2 sm:table-cell">
                      {entry.author || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="num text-[14px] font-medium text-ink">
                        {formatRequestsCount(entry.requests)}
                      </div>
                      {entry.requestsText && (
                        <div className="mono text-[11px] text-ink-4">{entry.requestsText}</div>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-right sm:table-cell lg:px-[22px]">
                      <span className="mono text-[13px] text-ink-2">{entry.change || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-line bg-surface/40 px-4 py-2.5 text-[12px] text-ink-3 lg:px-[22px]">
          數據來源：
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
            {sourceName}
          </a>
          （依{" "}
          <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
            {license}
          </a>{" "}
          授權；本頁已排除 <code className="mono text-[11px]">Others</code> 彙總列並重新順排名次）。
        </div>
      </section>
    </div>
  );
}
