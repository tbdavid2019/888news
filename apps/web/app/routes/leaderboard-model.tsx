import { useEffect, useState, type ReactNode } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { Collapse } from "../components/ui/Presence";
import type { Route } from "./+types/leaderboard-model";
import type { LbComparison, LbEvidenceItem, LbModelDetail } from "@aihot/contracts/leaderboard";
import { LEADERBOARD_BOARD_LABELS, LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/industry/site";
import { edgeTtl, loadOr404 } from "../lib/api.server";
import { monthDay } from "../lib/format";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { BrandMark } from "../features/leaderboard/BrandMark";
import { boardHref, formatPrice, getPriceValue, listPrice, noOfficialApi, pctFixed, score, shortStamp, tokensWan, type LbCurrency } from "../features/leaderboard/format";
import { IconArrowLeft, IconArrowRight, IconArrowUpRight, IconChevronDown, IconExternal } from "../components/icons";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "leaderboard" };

export async function loader({ params, request }: Route.LoaderArgs) {
  return loadOr404<LbModelDetail>(`/api/site/leaderboard/models/${encodeURIComponent(params.slug)}`, { request, signal: request.signal });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("頁面不存在") }];
  const { model } = loaderData;
  const path = `/leaderboard/${model.slug}`;
  return pageMeta({
    title: `${model.name} 評分、排名與各項成績`,
    matches,
    description: `查看 ${model.name} 的${loaderData.historical ? "歷史" : "當前"} ${SITE.name} 評分、參考名次與依據覆蓋，以及各項公開評測的原始成績和運行配置。`,
    path,
    image: "/og/pages/leaderboard.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `${model.name} 在 ${SITE.name} 模型榜的成績`,
        description: `${model.name} 的 ${SITE.name} 評分、參考名次與各項公開評測的原始成績。`,
        url: `${siteUrl()}${path}`,
        creator: { "@type": "Organization", name: SITE.name, url: siteUrl() },
        isAccessibleForFree: true,
      },
      breadcrumbLd([
        { name: "模型榜", path: "/leaderboard" },
        { name: model.name, path },
      ]),
    ],
  });
}

export function headers() {
  return edgeTtl(600);
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="mono text-[11px] font-semibold tracking-[0.14em] text-accent">{children}</span>;
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.5] text-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-ink-3">{sub}</p>
    </>
  );
}

function Stat({ label, children, foot }: { label: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[11px] text-ink-4">{label}</span>
      <span className="mono mt-2 text-[20px] font-semibold leading-tight text-ink">{children}</span>
      {foot && <span className="mt-1.5 text-[12px] text-ink-3">{foot}</span>}
    </div>
  );
}

function Capability({ d, from }: { d: LbModelDetail; from: string }) {
  return (
    <section className="mt-12">
      <SectionHead eyebrow="CAPABILITY PROFILE" title="各有所長，看得更清楚。" sub="每類單獨評分，越高表示該分類表現越強。具體能力請看原始成績與配置。" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.categories.map((c) => (
          <Link
            key={c.key}
            to={boardHref(c.key)}
            className={`card card-hover group flex h-full flex-col rounded-card p-4 lg:p-[22px] ${c.key === from ? "border-accent/45" : ""}`}
          >
            <span className="text-[14px] font-semibold text-ink transition-colors group-hover:text-accent">{c.name}</span>
            <span className="mt-3 text-[11px] text-ink-4">{SITE.name} 評分</span>
            <span className="mono mt-1 text-[28px] font-medium leading-tight tracking-[-0.03em] text-ink">{score(c.score)}<span className="ml-1 text-[12px] text-ink-4">分</span></span>
            {c.rank !== null && <span className="mt-1 text-[12px] text-ink-3">參考第 {c.rank} 位</span>}
            {!c.onBoard && <span className="mt-1 text-[11px] text-ink-4">{c.rank === null ? "暫無足夠的可比成績" : "前 30 位之外"}</span>}
            <span className="mt-auto pt-4 text-[12px] text-ink-3">{c.sourceCount} 項評測 · 覆蓋 {Math.round(c.coverage * 100)}%</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-4">評分和參考名次只在同一分類、同一輪內比較。缺測不補分；覆蓋比例不代表能力高低。</p>
    </section>
  );
}

/** A continuous relative difference on shared evaluations; not a win probability. */
function NetValue({ net }: { net: number }) {
  const v = Math.round(net * 100) / 100;
  if (v === 0) return <span className="text-[12px] text-ink-4">0.00</span>;
  return <span className={`mono text-[12.5px] font-semibold ${v > 0 ? "text-accent" : "text-amber-ink"}`}>{v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`}</span>;
}

function Comparisons({ d }: { d: LbModelDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-left">
        <span className="text-[13.5px] font-semibold text-ink">查看與附近模型的共同依據</span>
        <span className={`text-[18px] leading-none text-ink-4 transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
      <Collapse open={open} duration={300}>
        <p className="text-[13px] text-ink-3">共同評測的相對成績差只看雙方都有成績的項目。正值表示本模型較高，負值表示對方較高；不是勝率，也不表示顯著領先。完整參考順序還需處理其他模型間的衝突。</p>
        <ul className="-mx-3 divide-y divide-line-soft pb-3 pt-2">
          {d.comparisons.map((c) => <ComparisonRow key={c.model.slug} c={c} name={d.model.name} />)}
        </ul>
      </Collapse>
    </div>
  );
}

function ComparisonRow({ c, name }: { c: LbComparison; name: string }) {
  const [open, setOpen] = useState(false);
  const favours = c.net > 1e-9 ? "本模型相對成績較高" : c.net < -1e-9 ? "對方相對成績較高" : "相對成績差為零";
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-tile px-3 py-3 text-left transition-colors hover:bg-bg-sunk">
        <BrandMark brand={c.model.brand} size={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{c.model.name} <span className="num text-[12px] text-ink-4">參考 {c.rank} 位</span></span>
          <span className="text-[12px] text-ink-3">{c.sharedCount} 項共同評測 · {favours}</span>
        </span>
        <NetValue net={c.net} />
        <span className={`text-ink-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}><IconChevronDown size={15} /></span>
      </button>
      <Collapse open={open} duration={300}>
        <div className="px-3 pb-4">
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            共同評測的權重合計為 {pctFixed(c.sharedWeight)}。相對成績差採用固定參照校準後的連續分差，缺測項目不參與。下表保留採用的原始成績。
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead className="text-ink-4">
                <tr className="border-b border-line">
                  <th className="py-2 text-left font-medium">共同評測</th>
                  <th className="py-2 text-right font-medium">{name}</th>
                  <th className="py-2 text-right font-medium">{c.model.name}</th>
                  <th className="py-2 text-right font-medium">權重</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.sourceKey} className="border-b border-line last:border-0">
                    <td className="py-2 pr-2"><Link viewTransition to={`/leaderboard/sources/${r.sourceKey}`} className="text-ink-2 hover:text-accent">{r.sourceName}</Link></td>
                    <td className="num py-2 text-right text-ink">{r.mine}</td>
                    <td className="num py-2 text-right text-ink-2">{r.theirs}</td>
                    <td className="num py-2 text-right text-ink-4">{pctFixed(r.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.hasPage && (
            <Link viewTransition to={`/leaderboard/${c.model.slug}`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">
              查看 {c.model.name} 的完整依據 <IconArrowRight size={13} />
            </Link>
          )}
        </div>
      </Collapse>
    </li>
  );
}

function EvidenceCard({ it }: { it: LbEvidenceItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="card overflow-hidden rounded-tile">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-accent-softer lg:px-5">
        <BrandMark brand={it.brand} size={28} className="max-sm:hidden" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{it.sourceName}</span>
          <small className="text-[11px] text-ink-4">{it.usage}</small>
        </span>
        <span className="text-right">
          <span className="mono block text-[19px] font-medium leading-tight text-ink">{it.display}</span>
          {it.displayNote && <span className="block text-[11px] text-ink-4">{it.displayNote}</span>}
        </span>
        <span className={`grid size-6 shrink-0 place-items-center text-[17px] leading-none text-ink-4 transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
      <Collapse open={open} duration={300}>
        <dl className="grid gap-3 border-t border-line-soft px-4 py-4 text-[12.5px] sm:grid-cols-2 lg:px-5">
          <div>
            <dt className="text-ink-4">原榜型號</dt>
            <dd className="mt-0.5 break-all font-mono text-[12px] text-ink-2">{it.sourceModelName ?? "—"}{it.sourceRank !== null && <span className="ml-1.5 font-sans text-ink-4">原榜第 {it.sourceRank} 名</span>}</dd>
          </div>
          <div>
            <dt className="text-ink-4">代表配置</dt>
            <dd className="mt-0.5 text-ink-2">{it.configurationLabel ?? "—"}</dd>
          </div>
          {it.selectionReason && <p className="text-ink-3 sm:col-span-2">{it.selectionReason}</p>}
          <div className="sm:col-span-2">
            <dt className="text-ink-4">本輪採用記錄</dt>
            <dd className="num mt-0.5 text-ink-2">
              來源數據 {shortStamp(it.upstreamAt)} · 核驗 {shortStamp(it.verifiedAt)} · {it.measuredAt ? `實測 ${shortStamp(it.measuredAt)}` : "實測日期未公開"}
              {it.carriedForward && " · 沿用最近一次已核驗記錄"}
            </dd>
          </div>
          {it.components.length > 0 && (
            <div className="sm:col-span-2">
              {it.componentsNote && <p className="text-ink-3">{it.componentsNote}</p>}
              <div className="mt-2 flex gap-2">
                {it.components.map((c) => (
                  <span key={c.label} className="rounded-control bg-bg-sunk px-3 py-1.5">
                    <span className="block text-[11px] text-ink-4">{c.label}</span>
                    <span className="num text-[14px] font-semibold text-ink">{c.display}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-4 sm:col-span-2">
            <Link viewTransition to={`/leaderboard/sources/${it.sourceKey}`} className="inline-flex items-center gap-1 font-medium text-accent">查看這項評測 <IconArrowRight size={13} /></Link>
            {it.officialUrl && (
              <a href={it.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-accent">官方來源 <IconExternal size={12} /></a>
            )}
          </div>
        </dl>
      </Collapse>
    </li>
  );
}

export default function LeaderboardModelPage() {
  const d = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const [currency, setCurrency] = useState<LbCurrency>("TWD");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lb_currency");
      if (saved === "USD" || saved === "TWD") setCurrency(saved);
    } catch {}
  }, []);

  const toggleCurrency = () => {
    const next = currency === "TWD" ? "USD" : "TWD";
    setCurrency(next);
    try {
      localStorage.setItem("lb_currency", next);
    } catch {}
  };

  // The server page is shared by every ?from= (shared caches keep it once), so the board to return
  // to is applied after hydration; server HTML and the first client render both say "總榜".
  const [fromParam, setFromParam] = useState<string | null>(null);
  useEffect(() => setFromParam(params.get("from")), [params]);
  const from = fromParam && (LEADERBOARD_PUBLIC_BOARDS as readonly string[]).includes(fromParam) ? fromParam : "overall";
  const { model, price, overall } = d;
  const withRanks = d.categories.filter((c) => c.rank !== null).length;
  return (
    <div className="pb-12">
      <PhoneBar back={{ to: boardHref(from), label: "模型榜" }} title={model.name} />
      <Link to={boardHref(from)} className="hidden items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        <IconArrowLeft size={14} /> 返回{LEADERBOARD_BOARD_LABELS[from as keyof typeof LEADERBOARD_BOARD_LABELS]}榜
      </Link>

      {d.historical && (
        <p className="well mt-4 px-4 py-3 text-[13px] leading-relaxed text-ink-3">
          該模型當前未入榜。以下保留它最後一次已發布的成績，參考名次與評測依據截至 {monthDay(beijingDate(d.run.generatedAt))}。
        </p>
      )}

      <header className="mt-3 flex flex-col gap-5 pb-7 sm:flex-row sm:items-end sm:justify-between lg:mt-5">
        <div className="flex items-center gap-4">
          <BrandMark brand={model.brand} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">{model.name}</h1>
              {model.weightsUrl && (
                <a href={model.weightsUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[12.5px] text-accent hover:underline">
                  開源權重 ↗
                </a>
              )}
            </div>
            <p className="num mt-1 text-[12.5px] text-ink-3">
              {model.provider ?? "—"} · {model.releasedAt ? `${model.releasedAt} 發布` : "發布日期待核實"} · {shortStamp(d.run.generatedAt)} 更新
            </p>
          </div>
        </div>
        <div className="sm:text-right">
          <span className="block text-[12px] text-ink-4">{SITE.name} 評分 · 綜合</span>
          <strong className="mono block text-[38px] font-medium leading-[1.4] tracking-[-0.035em] text-accent lg:text-[44px]">{score(overall.score)}<span className="ml-1 text-[14px] font-normal text-ink-4">分</span></strong>
          {overall.rank !== null && <span className="block text-[13px] text-ink-2">綜合參考名次 · 第 {overall.rank} 位</span>}
          <span className="block text-[12px] text-ink-3">
            {overall.rank === null ? "暫無足夠的可比依據" : overall.score === null ? "該歷史輪次未提供此評分" : "0–100 分，非正確率"} · 依據覆蓋 {Math.round(overall.coverage * 100)}%
          </span>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-4 gap-y-6 border-y border-line py-6 lg:grid-cols-4" aria-label="模型概覽">
        <Stat label="可比較分類">
          {withRanks}
          <small className="ml-1 font-sans text-[11px] font-normal text-ink-4">/ 4 項分類</small>
        </Stat>
        <Stat label="已有成績">
          {d.metricCount}
          <small className="ml-1 font-sans text-[11px] font-normal text-ink-4">項評測</small>
        </Stat>
        <Stat label="上下文視窗">
          {tokensWan(model.contextWindowTokens)}
          <small className="ml-1 font-sans text-[11px] font-normal text-ink-4">Token</small>
        </Stat>
        <Stat
          label={`API 輸入 / 輸出 · 每百萬 Token (${currency === "TWD" ? "新台幣 TWD" : "美元 USD"})`}
          foot={
            price ? (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                {noOfficialApi(price) && <span>{price.note ?? "廠商未提供付費 API"}</span>}
                {getPriceValue(price, "cached", currency) !== null && (
                  <span className="num">快取 {formatPrice(getPriceValue(price, "cached", currency), currency)}</span>
                )}
                {price.currency === "USD" && !noOfficialApi(price) && currency === "TWD" && (
                  <span className="num text-ink-4">
                    美元原價 {listPrice(price.input, "USD")} / {listPrice(price.output, "USD")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={toggleCurrency}
                  className="text-[11.5px] font-medium text-accent hover:underline"
                >
                  切換為{currency === "TWD" ? "美元 (USD)" : "新台幣 (TWD)"}
                </button>
                {price.officialUrl && (
                  <a href={price.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:text-accent-ink">
                    {noOfficialApi(price) ? "來源" : "廠商官方價格"} <IconArrowUpRight size={12} />
                  </a>
                )}
              </span>
            ) : (
              "尚未核實廠商官網價格"
            )
          }
        >
          {price && !noOfficialApi(price) ? (
            `${formatPrice(getPriceValue(price, "input", currency), currency)} / ${formatPrice(getPriceValue(price, "output", currency), currency)}`
          ) : (
            <span className="font-sans text-[15px] font-normal text-ink-4">{price ? "無官方價" : "待核實"}</span>
          )}
        </Stat>
      </section>

      <Capability d={d} from={from} />
      {d.comparisons.length > 0 && <section className="mt-12"><Comparisons d={d} /></section>}

      <section className="mt-12">
        <SectionHead eyebrow="BEHIND THE SCORE" title="每一項成績，都有來處。" sub="下面是該模型的公開彙總成績。展開可查看運行配置與採用方式。" />
        {d.evidence.map((g) => (
          <div key={g.key} className="mt-6">
            <h3 className="flex items-baseline gap-2 text-[14px] font-semibold text-ink">
              {g.name}
              <span className="num text-[11.5px] font-normal text-ink-4">{g.items.length} 項</span>
            </h3>
            <ul className="mt-2.5 space-y-2">
              {g.items.map((it) => (
                <EvidenceCard key={it.sourceKey} it={it} />
              ))}
            </ul>
          </div>
        ))}
        {d.excluded.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[14px] font-semibold text-ink">測過，但按規則不計入</h3>
            <p className="mt-1 text-[12.5px] text-ink-3">這些公開成績未滿足本榜的可比條件，具體原因如下。統一固定工具、全程使用同一型號可以採用；多模型回退、混合模型與專屬異構 Agent 系統不混入模型榜。資料未說明的項目保留未知。</p>
            <ul className="mt-2.5 space-y-1.5 text-[13px]">
              {d.excluded.map((x) => (
                <li key={x.key}>
                  <Link viewTransition to={`/leaderboard/sources/${x.key}`} className="font-medium text-ink-2 transition-colors hover:text-accent">{x.name}</Link>
                  <span className="text-ink-3">：{x.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.unmeasured.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[14px] font-semibold text-ink">尚無成績的評測</h3>
            <p className="mt-1 text-[12.5px] text-ink-3">這些評測尚無可採用的公開成績，缺測不補分。</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {d.unmeasured.map((u) => (
                <Link viewTransition key={u.key} to={`/leaderboard/sources/${u.key}`} className="chip">
                  {u.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-[15px] font-semibold text-ink">還有一些未知</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">參考名次只概括已取得的公開依據，缺測不補分。不同運行配置、未知誤差與新評測都可能改變順序，相鄰名次不等於已證明的能力差距。</p>
        {overall.missingDimensions.length > 0 && <p className="mt-1.5 text-[13px] text-ink-3">尚缺能力維度：{overall.missingDimensions.join("、")}。</p>}
        {overall.unknownErrorCount > 0 && <p className="mt-1.5 text-[13px] text-ink-3">{overall.unknownErrorCount} 項採用的成績未公開可用標準誤差；未知不按零誤差處理。</p>}
        <Link viewTransition to="/leaderboard/rules" className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-ink">
          了解計算方法 →
        </Link>
      </section>
    </div>
  );
}
