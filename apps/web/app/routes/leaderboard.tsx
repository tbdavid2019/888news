import { Link, data, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/leaderboard";
import type { LbBoardResponse } from "@aihot/contracts/leaderboard";
import { SITE } from "@aihot/industry/site";
import { edgeTtl, loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { BoardTable, SORTS, type SortKey } from "../features/leaderboard/BoardTable";
import { IconCheck, IconFilter, IconInfo } from "../components/icons";
import { ToggleChip } from "../components/ui/Controls";
import { Sheet } from "../components/ui/Sheet";
import { modelHref, shortStamp, type LbCurrency } from "../features/leaderboard/format";
import { useEntrance } from "../lib/hydration";

const CATEGORY_KEYS = new Set(["coding", "reasoning", "knowledge", "professional"]);

export async function loader({ params, request }: Route.LoaderArgs) {
  const key = params.key ?? "overall";
  if (params.key !== undefined && !CATEGORY_KEYS.has(params.key)) throw data({ message: "not_found" }, { status: 404 });
  return loadOr404<LbBoardResponse>(`/api/site/leaderboard/boards/${key}`, { request, signal: request.signal });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("頁面不存在") }];
  const { board, entries } = loaderData;
  const path = board.key === "overall" ? "/leaderboard" : `/leaderboard/category/${board.key}`;
  return pageMeta({
    title: board.title,
    rawTitle: true,
    matches,
    description: board.key === "overall" ? `彙總多家公開模型評測，展示 ${SITE.name} 評分、參考名次、分項成績、上線日期與 API 參考價格。` : board.description,
    path,
    image: "/og/pages/leaderboard.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: board.key === "overall" ? `${SITE.name} 大模型綜合榜` : `${SITE.name} ${board.name}模型榜`,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: entries.length,
        itemListElement: entries.map((e) => ({ "@type": "ListItem", position: e.rank, name: e.model.name, url: `${siteUrl()}${modelHref(e.model.slug)}` })),
      },
      breadcrumbLd(
        board.key === "overall"
          ? [{ name: "模型榜", path: "/leaderboard" }]
          : [{ name: "模型榜", path: "/leaderboard" }, { name: `${board.name}榜`, path }],
      ),
    ],
  });
}

export function headers() {
  return edgeTtl(600);
}

export default function LeaderboardPage() {
  const { board, entries, filterEntries, pending, run } = useLoaderData<typeof loader>();
  const [domestic, setDomestic] = useState(false);
  const [openWeights, setOpenWeights] = useState(false);
  const [currency, setCurrency] = useState<LbCurrency>("TWD");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lb_currency");
      if (saved === "USD" || saved === "TWD") setCurrency(saved);
    } catch {}
  }, []);

  const handleCurrencyChange = (c: LbCurrency) => {
    setCurrency(c);
    try {
      localStorage.setItem("lb_currency", c);
    } catch {}
  };

  const filtered = domestic || openWeights;
  const clear = () => {
    setDomestic(false);
    setOpenWeights(false);
  };
  const shown = filtered ? [...entries, ...(filterEntries ?? [])]
    .filter((e) => (!domestic || e.access?.domestic) && (!openWeights || !!e.access?.weightsUrl)).slice(0, 30) : entries;
  const entrance = useEntrance();
  return (
    <div key={board.key} className={entrance ? "animate-fade-up" : undefined}>
      <div className="mt-3 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[13.5px] text-ink-2">{board.description}</p>
        <p className="num text-[12px] text-ink-4">
          {board.sourceCount} 項評測<span className="mx-2">·</span>
          {board.operatorCount} 家機構<span className="mx-2">·</span>
          {shortStamp(run.generatedAt)} 更新
        </p>
      </div>

      <section className="card mt-3 overflow-hidden" aria-labelledby="lb-board-title">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 lg:px-[22px]">
          <h2 id="lb-board-title" className="text-[16px] font-bold text-ink">
            {board.key === "overall" ? "綜合榜" : `${board.name}榜`}
            <span className="mono ml-2 text-[11px] font-normal tracking-wide text-ink-4">{`${shown.length} 個模型`}</span>
          </h2>
          <div role="group" aria-label="篩選模型與幣別" className="hidden items-center gap-2 lg:flex">
            {filtered && (
              <button type="button" onClick={clear} className="mr-1 text-[12.5px] text-ink-4 transition-colors hover:text-ink">
                清除
              </button>
            )}
            <ToggleChip on={domestic} onToggle={() => setDomestic((v) => !v)}>中國模型</ToggleChip>
            <ToggleChip on={openWeights} onToggle={() => setOpenWeights((v) => !v)}>開源模型</ToggleChip>

            <div className="ml-2 inline-flex items-center rounded-full border border-line-strong bg-surface p-0.5 text-[12px] font-medium" role="radiogroup" aria-label="計價幣別">
              <button
                type="button"
                role="radio"
                aria-checked={currency === "TWD"}
                onClick={() => handleCurrencyChange("TWD")}
                className={`rounded-full px-2.5 py-1 transition-colors ${currency === "TWD" ? "bg-accent text-accent-contrast shadow-sm" : "text-ink-3 hover:text-ink"}`}
              >
                新台幣 (TWD)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={currency === "USD"}
                onClick={() => handleCurrencyChange("USD")}
                className={`rounded-full px-2.5 py-1 transition-colors ${currency === "USD" ? "bg-accent text-accent-contrast shadow-sm" : "text-ink-3 hover:text-ink"}`}
              >
                美元 (USD)
              </button>
            </div>
          </div>
          {/* Phones: the filters live in the panel with the orders. */}
          <div className="-my-1 flex items-center gap-2 lg:hidden">
            <button
              type="button"
              aria-label={`切換計價幣別（目前為${currency === "TWD" ? "新台幣" : "美元"}）`}
              onClick={() => handleCurrencyChange(currency === "TWD" ? "USD" : "TWD")}
              className="inline-flex h-11 items-center rounded-full border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink-2 active:scale-[0.98]"
            >
              {currency === "TWD" ? "NT$ 台幣" : "$ 美元"}
            </button>
            {filtered && (
              <button type="button" onClick={clear} className="h-11 px-2.5 text-[13px] text-ink-4 active:opacity-50">
                清除
              </button>
            )}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setPanel(true)}
              className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors active:scale-[0.98] ${filtered ? "border-accent/35 bg-accent-soft text-accent" : "border-line-strong bg-surface text-ink-2"}`}
            >
              <IconFilter size={16} />
              篩選
              {filtered && <span className="num">{Number(domestic) + Number(openWeights)}</span>}
            </button>
          </div>
        </div>
        {shown.length ? (
          <BoardTable entries={shown} board={board.key} sort={sort.key} dir={sort.dir} onSort={(key, dir) => setSort({ key, dir })} onSortSheet={() => setPanel(true)} currency={currency} />
        ) : (
          <p role="status" className="border-t border-line px-5 py-10 text-center text-[14px] text-ink-3">目前榜單暫無符合條件的模型。</p>
        )}
        <div className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-4 lg:px-[22px]">
          {!filtered && pending.length > 0 && (
            <p className="mb-1 text-ink-3">
              {board.key === "overall" ? "分類榜已有領先成績，但綜合依據尚不足：" : `綜合參考名次前十中暫未進入${board.name}榜：`}
              {pending.map((p, i) => (
                <span key={p.model.slug}>
                  {i > 0 && "、"}
                  <Link viewTransition to={modelHref(p.model.slug, board.key)} className="font-medium text-ink-2 transition-colors hover:text-accent">{p.model.name}</Link>
                  （已有 {p.sources} 項可比評測）
                </span>
              ))}
              。{board.key === "overall" ? "尚無綜合參考名次不等於能力較弱，仍可查看已有分類與原始成績。" : "分類榜只比較測過同類評測的模型，通常需要兩項、來自兩家機構的評測。"}
            </p>
          )}
          <p>{SITE.name} 評分為 0–100 分，越高表示本榜綜合表現越強。同分按參考名次排列；篩選後保留原榜評分與名次，每次最多展示 30 個模型。</p>
          {filtered && <p>中國模型按開發方歸屬篩選（收錄阿里雲 Qwen、DeepSeek、MiniMax、月之暗面 Kimi、智譜 GLM 等），不代表所有版本均可在特定地區直接使用。開源模型指已核驗公開官方權重的模型，使用許可與部署要求請查看權重頁面。</p>}
          <p>評分用於同一榜單、同一輪內的比較，不是正確率。各項評測的原始成績可在模型詳情查看。</p>
        </div>
      </section>

      {/* Phones: the orders on offer, each in its natural direction (choosing one closes the panel), and
          the filters, which may be combined. */}
      <Sheet open={panel} onClose={() => setPanel(false)} title="排序與篩選">
        <h3 className="px-5 pb-2 text-[12.5px] font-medium text-ink-4">排序</h3>
        <div role="radiogroup" aria-label="排序方式" className="mx-4 divide-y divide-line-soft overflow-hidden rounded-card ring-1 ring-inset ring-line">
          {SORTS.map((o) => {
            const on = sort.key === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setSort({ key: o.key, dir: 1 });
                  setPanel(false);
                }}
                className={`flex h-12 w-full items-center justify-between px-4 text-left text-[16px] transition-colors active:bg-bg-sunk ${on ? "font-semibold text-accent" : "text-ink"}`}
              >
                {o.label}
                {on ? <IconCheck size={19} strokeWidth={2.2} /> : <span className="text-[12.5px] text-ink-4">{o.order}</span>}
              </button>
            );
          })}
        </div>
        <h3 className="px-5 pb-2 pt-5 text-[12.5px] font-medium text-ink-4">篩選</h3>
        <div role="group" aria-label="篩選模型（可多選）" className="mx-4 divide-y divide-line-soft overflow-hidden rounded-card ring-1 ring-inset ring-line">
          {[
            { label: "中國模型", on: domestic, toggle: () => setDomestic((v) => !v) },
            { label: "開源模型", on: openWeights, toggle: () => setOpenWeights((v) => !v) },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              role="checkbox"
              aria-checked={f.on}
              onClick={f.toggle}
              className={`flex h-12 w-full items-center justify-between px-4 text-left text-[16px] transition-colors active:bg-bg-sunk ${f.on ? "font-semibold text-accent" : "text-ink"}`}
            >
              {f.label}
              <span aria-hidden="true" className={`inline-flex size-[22px] items-center justify-center rounded-full border transition-colors ${f.on ? "border-accent bg-accent text-accent-contrast" : "border-line-strong"}`}>
                {f.on && <IconCheck size={13} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
        <h3 className="px-5 pb-2 pt-5 text-[12.5px] font-medium text-ink-4">計價幣別</h3>
        <div role="radiogroup" aria-label="計價幣別" className="mx-4 divide-y divide-line-soft overflow-hidden rounded-card ring-1 ring-inset ring-line">
          {[
            { key: "TWD" as const, label: "新台幣 (TWD)", order: "預設" },
            { key: "USD" as const, label: "美元 (USD)", order: "美金原價" },
          ].map((c) => {
            const on = currency === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  handleCurrencyChange(c.key);
                  setPanel(false);
                }}
                className={`flex h-12 w-full items-center justify-between px-4 text-left text-[16px] transition-colors active:bg-bg-sunk ${on ? "font-semibold text-accent" : "text-ink"}`}
              >
                {c.label}
                {on ? <IconCheck size={19} strokeWidth={2.2} /> : <span className="text-[12.5px] text-ink-4">{c.order}</span>}
              </button>
            );
          })}
        </div>
      </Sheet>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <IconInfo size={16} className="text-accent" />
            如何看這張榜
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{board.howToRead}價格不參與排序，缺測不補分。能力表現請結合分項原始成績與運行配置判斷。</p>
          <Link viewTransition to="/leaderboard/rules" className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:text-accent-ink">
            了解計算方法 →
          </Link>
        </section>
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold text-ink">關於價格</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            API 價格來自廠商官網，按每百萬 Token 展示，預設以新台幣（TWD，參考匯率 1 USD ≈ 31.5 TWD）計價，亦可切換為美元（USD）。快取價格指命中後的輸入價格，快取寫入、儲存及訂閱費用另計。
          </p>
        </section>
      </div>
    </div>
  );
}
