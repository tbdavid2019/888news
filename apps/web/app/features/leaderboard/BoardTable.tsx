import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { LbBoardEntry } from "@aihot/contracts/leaderboard";
import { LB_CONFIDENCE_LABELS } from "@aihot/contracts/leaderboard";
import { BrandMark } from "./BrandMark";
import { EvidenceBadge } from "./Evidence";
import { formatPrice, getPriceValue, modelHref, type LbCurrency } from "./format";

type SortKey = "rank" | "released" | "coverage" | "cached" | "input" | "output";

function sortValue(e: LbBoardEntry, key: SortKey, currency: LbCurrency): number | null {
  switch (key) {
    case "rank":
      return e.rank;
    case "released":
      return e.model.releasedAt ? -Date.parse(e.model.releasedAt) : null;
    case "coverage":
      return -(e.coverage * 1000 + e.sourceCount);
    case "cached":
      return getPriceValue(e.price, "cached", currency);
    case "input":
      return getPriceValue(e.price, "input", currency);
    case "output":
      return getPriceValue(e.price, "output", currency);
  }
}

function sorted(entries: LbBoardEntry[], key: SortKey, dir: 1 | -1, currency: LbCurrency) {
  return [...entries].sort((a, b) => {
    const va = sortValue(a, key, currency);
    const vb = sortValue(b, key, currency);
    if (va === null && vb === null) return a.rank - b.rank;
    if (va === null) return 1; // unknown prices and dates always sink
    if (vb === null) return -1;
    return (va - vb) * dir || a.rank - b.rank;
  });
}

/** The top three sit on a small tinted plate; the rest are plain numbers. */
function Rank({ rank }: { rank: number }) {
  const n = String(rank).padStart(2, "0");
  if (rank <= 3) {
    return <span className="mono inline-flex h-7 w-[26px] items-center justify-center rounded-full bg-accent/[0.06] text-[13px] font-bold text-accent">{n}</span>;
  }
  return <span className="mono text-[13px] text-ink-4">{n}</span>;
}

function SortHeader({ k, children, sort, dir, onSort, align = "left", className = "" }: { k: SortKey; children: ReactNode; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; align?: "left" | "right"; className?: string }) {
  const active = sort === k;
  return (
    <th scope="col" aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"} className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button type="button" onClick={() => onSort(k)} className={`group/sort inline-flex items-start gap-1 text-left transition-colors hover:text-ink ${active ? "text-accent" : ""}`}>
        <span>{children}</span>
        <span className={`mt-[3px] text-[9px] transition ${active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-40"} ${active && dir === -1 ? "rotate-180" : ""}`} aria-hidden="true">
          ▲
        </span>
      </button>
    </th>
  );
}

export function BoardTable({ entries, board }: { entries: LbBoardEntry[]; board: string }) {
  const [currency, setCurrency] = useState<LbCurrency>("USD");
  const [sort, setSort] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lb_currency") as LbCurrency;
      if (saved === "USD" || saved === "TWD") setCurrency(saved);
    } catch {}
  }, []);

  const handleCurrencyChange = (c: LbCurrency) => {
    setCurrency(c);
    try {
      localStorage.setItem("lb_currency", c);
    } catch {}
  };

  const rows = useMemo(() => sorted(entries, sort, dir, currency), [entries, sort, dir, currency]);
  // Re-sorting moves each row from where it was to its new place (FLIP), as rows keep their key.
  const body = useRef<HTMLTableSectionElement>(null);
  const tops = useRef(new Map<string, number>());
  const order = rows.map((e) => e.model.slug).join(",");
  useLayoutEffect(() => {
    if (!body.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const row of Array.from(body.current.rows)) {
      const key = row.dataset.slug ?? "";
      const prev = tops.current.get(key);
      next.set(key, row.offsetTop);
      if (prev !== undefined && prev !== row.offsetTop && !reduce && row.animate) {
        row.animate([{ transform: `translateY(${prev - row.offsetTop}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
      }
    }
    tops.current = next;
  }, [order]);
  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(1);
    }
  };
  // No official price yet reads "待核驗"; a price without that tier (no cache pricing) reads "—".
  const price = (e: LbBoardEntry, field: "cached" | "input" | "output") => {
    if (!e.price) return <span className="text-[12px] text-ink-4">待核驗</span>;
    const v = getPriceValue(e.price, field, currency);
    return v == null ? <span className="text-ink-4">—</span> : formatPrice(v, currency);
  };

  const unit = <span className="block text-[10.5px] font-normal text-ink-4">{currency === "USD" ? "美元 / 百萬 Token" : "新台幣 / 百萬 Token"}</span>;

  return (
    <div>
      <div className="flex items-center justify-between border-y border-line bg-[rgba(28,39,51,0.02)] px-4 py-2 text-[12px] dark:bg-white/[0.015] lg:px-[22px]">
        <span className="text-ink-4">
          報價單位：<span className="font-medium text-ink-2">{currency === "USD" ? "美元 USD ($)" : "新台幣 TWD (NT$)"}</span> / 百萬 Token
        </span>
        <div className="inline-flex items-center rounded-full bg-surface p-0.5 ring-1 ring-line-strong text-[11.5px]">
          <button
            type="button"
            onClick={() => handleCurrencyChange("USD")}
            className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
              currency === "USD" ? "bg-accent text-white shadow-xs" : "text-ink-3 hover:text-ink"
            }`}
          >
            美元 USD ($)
          </button>
          <button
            type="button"
            onClick={() => handleCurrencyChange("TWD")}
            className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
              currency === "TWD" ? "bg-accent text-white shadow-xs" : "text-ink-3 hover:text-ink"
            }`}
          >
            新台幣 TWD (NT$)
          </button>
        </div>
      </div>
      <table className="w-full border-collapse text-[14px]">
        <caption className="sr-only">可按列重排的前 {entries.length} 名模型</caption>
        <thead className="bg-[rgba(28,39,51,0.04)] text-[12px] text-ink-4 dark:bg-white/[0.03]">
          <tr className="border-b border-line">
            <th scope="col" className="w-[44px] py-2.5 pl-4 pr-1 text-left font-medium lg:w-[68px] lg:pl-[22px] lg:pr-3">
              <button type="button" onClick={() => onSort("rank")} className={`transition-colors hover:text-ink ${sort === "rank" ? "text-accent" : ""}`}>
                排名
              </button>
            </th>
            <th scope="col" className="px-2 py-2.5 text-left font-medium lg:px-3">模型</th>
            <SortHeader k="released" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">上線日期</SortHeader>
            <SortHeader k="coverage" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">評測證據</SortHeader>
            <SortHeader k="cached" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">快取價格{unit}</SortHeader>
            <SortHeader k="input" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">輸入價格{unit}</SortHeader>
            <SortHeader k="output" sort={sort} dir={dir} onSort={onSort} className="hidden lg:table-cell">輸出價格{unit}</SortHeader>
            <th scope="col" className="py-2.5 pl-2 pr-4 text-right font-medium lg:pl-3 lg:pr-[22px]">
              <button
                type="button"
                onClick={() => onSort("rank")}
                title="共識指數把支援原排名的證據差異換算為 0—100，不是正確率。"
                className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-ink ${sort === "rank" ? "text-accent" : ""}`}
              >
                共識指數 <span className="inline-flex size-3.5 items-center justify-center rounded-full border border-current text-[9px] leading-none">i</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody ref={body}>
          {rows.map((e) => (
            <tr key={e.model.slug} data-slug={e.model.slug} className="group relative border-b border-line last:border-b-0 transition-colors hover:bg-accent-softer">
              <td className="py-3 pl-4 pr-1 align-middle lg:pl-[22px] lg:pr-3">
                <Rank rank={e.rank} />
              </td>
              <td className="px-2 py-3 lg:px-3">
                <Link to={modelHref(e.model.slug, board)} prefetch="intent" className="block after:absolute after:inset-0 after:content-['']">
                  <span className="flex items-center gap-3">
                    <BrandMark brand={e.model.brand} size={32} />
                    <span className="min-w-0">
                      <strong className="block text-[15px] font-[650] leading-[21px] text-ink transition-colors group-hover:text-accent">{e.model.name}</strong>
                      <small className="block text-[12px] leading-[18px] text-ink-4">{e.model.provider ?? "—"}</small>
                    </span>
                  </span>
                  {/* Phones: the desktop columns as three short lines under the whole name block. */}
                  <span className="mt-1.5 block text-[12px] leading-[1.7] text-ink-3 lg:hidden">
                    <span className="block">
                      上線 <span className="num">{e.model.releasedAt ?? "—"}</span> · {LB_CONFIDENCE_LABELS[e.confidence]}
                    </span>
                    <span className="block">
                      快取輸入 <span className="num">{price(e, "cached")}</span>
                    </span>
                    <span className="block">
                      輸入 <span className="num">{price(e, "input")}</span> · 輸出 <span className="num">{price(e, "output")}</span>
                    </span>
                  </span>
                </Link>
              </td>
              <td className="mono hidden px-3 py-3 text-[12px] text-ink-3 lg:table-cell">
                <time dateTime={e.model.releasedAt ?? undefined}>{e.model.releasedAt ?? "—"}</time>
              </td>
              <td className="relative z-10 hidden px-3 py-3 lg:table-cell">
                <span className="num block text-[13px] text-ink-2">{e.sourceCount} 項評測</span>
                <EvidenceBadge confidence={e.confidence} stability={e.stability} rank={e.rank} />
              </td>
              <td className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{price(e, "cached")}</td>
              <td className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{price(e, "input")}</td>
              <td className="mono hidden px-3 py-3 text-[14.5px] font-medium text-ink lg:table-cell">{price(e, "output")}</td>
              <td className="py-3 pl-2 pr-4 text-right align-middle lg:pl-3 lg:pr-[22px]">
                <strong className={`mono inline-block text-[20px] font-semibold leading-7 tracking-[-0.02em] ${e.rank <= 3 ? "text-accent" : "text-ink"}`} aria-label={`${e.model.name} 共識指數 ${e.score.toFixed(1)}`}>
                  {e.score.toFixed(1)}
                </strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
