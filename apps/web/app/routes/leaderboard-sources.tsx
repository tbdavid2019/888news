import { SITE, withSubject } from "@aihot/industry/site";
import { Link, useLoaderData } from "react-router";
import type { LbSourcesResponse } from "@aihot/contracts/leaderboard";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta } from "../lib/seo";
import { BrandMark } from "../features/leaderboard/BrandMark";
import { StatusChip } from "../features/leaderboard/StatusChip";
import { pct } from "../features/leaderboard/format";
import { IconArrowLeft, IconArrowUpRight } from "../components/icons";

export async function loader({ request }: { request: Request }) {
  return loadOr404<LbSourcesResponse>("/api/site/leaderboard/sources", { signal: request.signal });
}

export function meta() {
  return pageMeta({
    title: "評測來源",
    description: `瞭解 ${SITE.name} 採用和觀察中的評測來源、方法與資料進展。`,
    path: "/leaderboard/sources",
    image: "/og/pages/leaderboard.png",
    jsonLd: breadcrumbLd([
      { name: "模型榜", path: "/leaderboard" },
      { name: "評測來源", path: "/leaderboard/sources" },
    ]),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" };
}

export default function LeaderboardSourcesPage() {
  const { groups, rankedCount, totalCount } = useLoaderData<typeof loader>();
  return (
    <div className="pb-12">
      <Link to="/leaderboard" className="mt-4 inline-flex items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:mt-0">
        <IconArrowLeft size={14} /> 返回模型榜
      </Link>
      <header className="pb-2 pt-3">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">評測來源</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">每個來源測什麼、怎樣更新、是否進入排名，都可以在這裡找到。</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-baseline gap-6">
            <span className="flex items-baseline gap-1.5">
              <span className="mono text-[24px] font-semibold text-ink">{rankedCount}</span>
              <span className="text-[12px] text-ink-4">本輪參與排名</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="mono text-[24px] font-semibold text-ink">{totalCount}</span>
              <span className="text-[12px] text-ink-4">已審查來源與專項</span>
            </span>
          </div>
          <Link to="/leaderboard/rules" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-accent">
            排名怎麼算 <IconArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <nav aria-label="來源分組" className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {groups.map((g) => (
          <a
            key={g.key}
            href={`#${g.key}`}
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-line bg-surface px-3 text-[12.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-accent"
          >
            {g.name}
          </a>
        ))}
      </nav>

      {groups.map((g) => (
        <section key={g.key} id={g.key} className="scroll-mt-6 pt-10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[17px] font-bold text-ink">{g.name}</h2>
            <span className="mono text-[12px] text-ink-4">{g.sources.length}</span>
            <p className="text-[12.5px] text-ink-4">{g.blurb}</p>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.sources.map((s) => (
              <li key={s.key}>
                <Link to={`/leaderboard/sources/${s.key}`} className="card card-hover group flex h-full flex-col p-5">
                  <span className="flex items-start justify-between gap-3">
                    <BrandMark brand={s.brand} size={30} />
                    <StatusChip status={s.status} />
                  </span>
                  <span className="mt-3.5 text-[15px] font-bold leading-snug text-ink transition-colors group-hover:text-accent">{s.name}</span>
                  <span className="mt-1.5 line-clamp-3 flex-1 text-[12.5px] leading-[1.7] text-ink-3">{s.description}</span>
                  <span className="mt-4 flex items-center justify-between gap-3 text-[11.5px] text-ink-4">
                    <span className="min-w-0 truncate">{s.operator}</span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      {s.budget !== null && <span className="num">證據預算 {pct(s.budget)}</span>}
                      <IconArrowUpRight size={13} className="transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-4">
        “觀察中”表示仍在核對資料、執行條件或使用邊界，不參與綜合榜和分類榜。同一評測的重複抓取和展示切片不會增加票權；不同評測之間的題庫重疊仍需持續核對。
      </p>
    </div>
  );
}
