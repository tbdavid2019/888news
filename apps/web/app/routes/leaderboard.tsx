import { SITE, withSubject } from "@aihot/industry/site";
import { Link, data, useLoaderData } from "react-router";
import type { Route } from "./+types/leaderboard";
import type { LbBoardResponse } from "@aihot/contracts/leaderboard";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { BoardTable } from "../features/leaderboard/BoardTable";
import { Podium } from "../features/leaderboard/Podium";
import { IconInfo } from "../components/icons";
import { modelHref, shortStamp } from "../features/leaderboard/format";
import { useEntrance } from "../lib/hydration";

const CATEGORY_KEYS = new Set(["coding", "reasoning", "knowledge", "professional"]);

export async function loader({ params, request }: Route.LoaderArgs) {
  const key = params.key ?? "overall";
  if (params.key !== undefined && !CATEGORY_KEYS.has(params.key)) throw data({ message: "not_found" }, { status: 404 });
  return loadOr404<LbBoardResponse>(`/api/site/leaderboard/boards/${key}`, { signal: request.signal });
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("頁面不存在") }];
  const { board, entries } = loaderData;
  const path = board.key === "overall" ? "/leaderboard" : `/leaderboard/category/${board.key}`;
  return pageMeta({
    title: board.title,
    rawTitle: true,
    description: board.key === "overall" ? "彙總多家公開模型評測榜單，給出${SITE.name} 共識分、評測完整度、上線日期與 API 參考價格。" : board.description,
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
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" };
}

export default function LeaderboardPage() {
  const { board, entries, run } = useLoaderData<typeof loader>();
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

      <Podium entries={entries} board={board.key} />

      <section className="card mt-3 overflow-hidden" aria-labelledby="lb-board-title">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-[22px]">
          <h2 id="lb-board-title" className="text-[16px] font-bold text-ink">
            {board.key === "overall" ? "綜合榜" : `${board.name}榜`}
            <span className="mono ml-2 text-[11px] font-normal tracking-wide text-ink-4">TOP {entries.length}</span>
          </h2>
          <span className="text-right text-[12px] text-ink-4">按多項公開評測的共同證據排名</span>
        </div>
        <BoardTable entries={entries} board={board.key} />
        <div className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-4 lg:px-[22px]">
          <p>每個榜單最多展示 30 個模型</p>
          <p>共識指數不是正確率；同分仍按共同證據確定的名次展示。</p>
        </div>
      </section>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <IconInfo size={16} className="text-accent" />
            如何看這張榜
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{board.howToRead}價格不參與排名，缺測不記零分，指數不是正確率。</p>
          <Link to="/leaderboard/rules" className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:text-accent-ink">
            瞭解計算方法 →
          </Link>
        </section>
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold text-ink">關於價格</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            API 價格來自廠商官網，按每百萬 Token 展示，預設以美元（USD）計價，亦可切換為新台幣（TWD，參考匯率 1 USD ≈ 31.5 TWD）。快取價格指命中後的輸入價格，快取寫入、儲存及訂閱費用另計。
          </p>
        </section>
      </div>
    </div>
  );
}
