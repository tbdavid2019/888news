import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/leaderboard-decisions";
import type { LbDecisionsBoardResponse } from "@aihot/contracts/leaderboard";
import { SITE } from "@aihot/industry/site";
import { IconArrowUpRight } from "../components/icons";
import { Select } from "../components/ui/Controls";
import { PillTabs } from "../components/ui/Tabs";
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
    description: `追蹤 OpenRouter Decision Models 真實生產環境請求量排行、機構市占率（Market Share）、評估維度（Criteria）與領域分類（Domain）分佈（僅作參考，不進 ${SITE.name} 能力總分）。`,
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

function ChangeBadge({ change }: { change: string | null | undefined }) {
  if (!change || change === "—" || change === "0%") {
    return <span className="mono text-[12px] text-ink-4">{change || "—"}</span>;
  }
  const isPositive = change.startsWith("+");
  const isNegative = change.startsWith("-");
  return (
    <span
      className={`mono inline-flex items-center rounded px-1.5 py-0.5 text-[11.5px] font-medium ${
        isPositive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : isNegative
            ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
            : "text-ink-3"
      }`}
    >
      {change}
    </span>
  );
}

function DeltaPpBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) {
    return <span className="mono text-[12px] text-ink-4">0.0 pp</span>;
  }
  const isPositive = delta > 0;
  const text = `${isPositive ? "+" : ""}${delta.toFixed(1)} pp`;
  return (
    <span
      className={`mono inline-flex items-center rounded px-1.5 py-0.5 text-[11.5px] font-medium ${
        isPositive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
      }`}
    >
      {text}
    </span>
  );
}

function ShareBar({ percent, max = 100 }: { percent: number; max?: number }) {
  const widthPercent = Math.min(100, Math.max(0, (percent / max) * 100));
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line-soft dark:bg-line sm:w-28">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className="mono min-w-[3.2rem] text-right text-[12.5px] font-medium text-ink">
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

export default function LeaderboardDecisionsPage() {
  const {
    updatedAt,
    sourceName,
    sourceUrl,
    license,
    licenseUrl,
    entries = [],
    marketShare = [],
    criteria = [],
    domains = [],
  } = useLoaderData<typeof loader>();
  const entrance = useEntrance();

  const [selectedCriterion, setSelectedCriterion] = useState<string>(
    () => criteria[0]?.value ?? "",
  );
  const [selectedDomain, setSelectedDomain] = useState<string>(
    () => domains[0]?.value ?? "",
  );

  const activeCriterion =
    criteria.find((c) => c.value === selectedCriterion) ?? criteria[0];
  const activeDomain =
    domains.find((d) => d.value === selectedDomain) ?? domains[0];

  const effectiveCriterionKey = activeCriterion?.value ?? "";
  const effectiveDomainKey = activeDomain?.value ?? "";

  return (
    <div key="decisions" className={entrance ? "animate-fade-up" : undefined}>
      {/* 標題與說明 */}
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

      {/* 頂部 Summary 指標卡片 */}
      <div className="mt-3.5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-3.5 sm:p-4">
          <div className="text-[12px] font-medium text-ink-3">已收錄決策模型</div>
          <div className="num mt-1 text-[22px] font-bold text-ink sm:text-[24px]">
            {entries.length} <span className="text-[13px] font-normal text-ink-4">個</span>
          </div>
          <div className="mt-1 text-[11.5px] text-ink-4">涵蓋分類與結構化輸出</div>
        </div>

        <div className="card p-3.5 sm:p-4">
          <div className="text-[12px] font-medium text-ink-3">市場龍頭廠商</div>
          <div className="mt-1 truncate text-[18px] font-bold text-ink sm:text-[20px]">
            {marketShare[0]?.author || "—"}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-4">
            {marketShare[0]?.shareText ? `市占率 ${marketShare[0].shareText}` : "等待數據同步"}
          </div>
        </div>

        <div className="card p-3.5 sm:p-4">
          <div className="text-[12px] font-medium text-ink-3">最主要評估維度</div>
          <div className="mt-1 truncate text-[18px] font-bold text-ink sm:text-[20px]">
            {criteria[0]?.label || "—"}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-4">
            {criteria[0] ? `佔總量 ${(criteria[0].shareOfTotal * 100).toFixed(1)}%` : "等待數據同步"}
          </div>
        </div>

        <div className="card p-3.5 sm:p-4">
          <div className="text-[12px] font-medium text-ink-3">最大應用領域</div>
          <div className="mt-1 truncate text-[18px] font-bold text-ink sm:text-[20px]">
            {domains[0]?.label || "—"}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-4">
            {domains[0] ? `佔總量 ${(domains[0].shareOfTotal * 100).toFixed(1)}%` : "等待數據同步"}
          </div>
        </div>
      </div>

      {/* 主榜單 Section：Top Decision Models */}
      <section className="card mt-4 overflow-hidden" aria-labelledby="lb-decisions-title">
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
                      <ChangeBadge change={entry.change} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Market Share Section: 機構市占率 */}
      {marketShare.length > 0 && (
        <section className="card mt-4 overflow-hidden" aria-labelledby="lb-marketshare-title">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 lg:px-[22px]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="lb-marketshare-title" className="text-[16px] font-bold text-ink">
                機構市占率 (Market Share)
              </h2>
              <span className="mono text-[11px] font-normal tracking-wide text-ink-4">
                {marketShare.length} 家機構
              </span>
              <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-3">
                每週請求份額
              </span>
            </div>
            <span className="mono text-[12px] text-ink-4">Table 1 · Share of requests</span>
          </div>

          <div className="overflow-x-auto border-t border-line">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface/60 text-[12px] text-ink-3">
                  <th scope="col" className="w-16 px-4 py-2.5 font-medium lg:px-[22px]">名次</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">機構 / 作者</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">請求份額 (Share of requests)</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium lg:px-[22px]">週變化</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {marketShare.map((row, idx) => (
                  <tr
                    key={`${row.rank ?? "na"}-${row.author}-${idx}`}
                    className={`transition-colors hover:bg-surface/60 ${
                      !row.rank ? "bg-surface/30 italic text-ink-3" : ""
                    }`}
                  >
                    <td className="px-4 py-3 lg:px-[22px]">
                      <span className="mono text-[13px] text-ink-4">
                        {row.rank != null ? String(row.rank).padStart(2, "0") : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[14px] ${row.rank != null ? "font-medium text-ink" : "text-ink-2"}`}>
                        {row.author}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.sharePercent != null ? (
                        <ShareBar percent={row.sharePercent} max={100} />
                      ) : (
                        <span className="mono text-[13px] text-ink">{row.shareText || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right lg:px-[22px]">
                      <ChangeBadge change={row.change} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Evaluation Criteria Section: 評估維度分佈 */}
      {criteria.length > 0 && (
        <section className="card mt-4 overflow-hidden" aria-labelledby="lb-criteria-title">
          <div className="flex flex-col gap-3 px-4 py-3.5 lg:px-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="lb-criteria-title" className="text-[16px] font-bold text-ink">
                  評估維度分佈 (Evaluation Criteria)
                </h2>
                <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-3">
                  能力維度份額
                </span>
              </div>
              {activeCriterion && (
                <span className="text-[12.5px] text-ink-3">
                  <span className="font-medium text-ink">{activeCriterion.label}</span> 佔總決策請求量的{" "}
                  <span className="mono font-semibold text-accent">
                    {(activeCriterion.shareOfTotal * 100).toFixed(1)}%
                  </span>
                </span>
              )}
            </div>

            <div className="pt-1">
              <PillTabs
                layoutId="lb-criteria-tabs"
                label="評估維度切換"
                size="sm"
                active={effectiveCriterionKey}
                onSelect={setSelectedCriterion}
                items={criteria.map((c) => ({
                  key: c.value,
                  label: c.label,
                  count: c.models.length > 0 ? c.models.length : undefined,
                }))}
              />
            </div>
          </div>

          {activeCriterion && activeCriterion.models.length > 0 ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface/60 text-[12px] text-ink-3">
                    <th scope="col" className="w-16 px-4 py-2.5 font-medium lg:px-[22px]">名次</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">模型</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">機構 / 作者</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">維度內份額 (Category Share)</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium lg:px-[22px]">變化 (Delta)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {activeCriterion.models.map((m, idx) => (
                    <tr key={`${m.model}-${idx}`} className="transition-colors hover:bg-surface/60">
                      <td className="px-4 py-3 lg:px-[22px]">
                        <span className="mono text-[13px] text-ink-4">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="text-[14px] font-medium text-ink">{m.name}</span>
                          <span className="mono mt-0.5 text-[11px] text-ink-4 sm:hidden">{m.author}</span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-[13px] text-ink-2 sm:table-cell">
                        {m.author || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <ShareBar percent={m.share * 100} max={100} />
                      </td>
                      <td className="px-4 py-3 text-right lg:px-[22px]">
                        <DeltaPpBadge delta={m.deltaPp} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line px-4 py-8 text-center text-[13px] text-ink-4">
              此維度尚無模型排行數據。
            </div>
          )}
        </section>
      )}

      {/* Domain Breakdown Section: 領域分類分佈 */}
      {domains.length > 0 && (
        <section className="card mt-4 overflow-hidden" aria-labelledby="lb-domains-title">
          <div className="flex flex-col gap-3 px-4 py-3.5 lg:px-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="lb-domains-title" className="text-[16px] font-bold text-ink">
                  領域分類分佈 (Domain Breakdown)
                </h2>
                <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-3">
                  垂直應用領域
                </span>
              </div>
              <div className="flex items-center gap-2">
                {activeDomain && (
                  <span className="hidden text-[12.5px] text-ink-3 sm:inline">
                    <span className="font-medium text-ink">{activeDomain.label}</span> 佔總請求量的{" "}
                    <span className="mono font-semibold text-accent">
                      {(activeDomain.shareOfTotal * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
                <Select
                  value={effectiveDomainKey}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  aria-label="快速選擇領域"
                >
                  {domains.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label} ({(d.shareOfTotal * 100).toFixed(1)}%)
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="pt-1">
              <PillTabs
                layoutId="lb-domains-tabs"
                label="領域類別切換"
                size="sm"
                active={effectiveDomainKey}
                onSelect={setSelectedDomain}
                items={domains.map((d) => ({
                  key: d.value,
                  label: d.label,
                }))}
              />
            </div>
          </div>

          {activeDomain && activeDomain.models.length > 0 ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface/60 text-[12px] text-ink-3">
                    <th scope="col" className="w-16 px-4 py-2.5 font-medium lg:px-[22px]">名次</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">模型</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">機構 / 作者</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">領域內份額 (Domain Share)</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium lg:px-[22px]">變化 (Delta)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {activeDomain.models.map((m, idx) => (
                    <tr key={`${m.model}-${idx}`} className="transition-colors hover:bg-surface/60">
                      <td className="px-4 py-3 lg:px-[22px]">
                        <span className="mono text-[13px] text-ink-4">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="text-[14px] font-medium text-ink">{m.name}</span>
                          <span className="mono mt-0.5 text-[11px] text-ink-4 sm:hidden">{m.author}</span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-[13px] text-ink-2 sm:table-cell">
                        {m.author || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <ShareBar percent={m.share * 100} max={100} />
                      </td>
                      <td className="px-4 py-3 text-right lg:px-[22px]">
                        <DeltaPpBadge delta={m.deltaPp} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line px-4 py-8 text-center text-[13px] text-ink-4">
              此領域尚無模型排行數據。
            </div>
          )}
        </section>
      )}

      {/* 授權宣告與數據來源 */}
      <div className="card mt-4 bg-surface/40 px-4 py-3 text-[12px] text-ink-3 lg:px-[22px]">
        數據來源：
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line-strong underline-offset-2 hover:text-ink"
        >
          {sourceName}
        </a>
        （依{" "}
        <a
          href={licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line-strong underline-offset-2 hover:text-ink"
        >
          {license}
        </a>{" "}
        授權；本頁已排除 <code className="mono text-[11px]">Others</code> 彙總列並重新順排名次）。
      </div>
    </div>
  );
}
