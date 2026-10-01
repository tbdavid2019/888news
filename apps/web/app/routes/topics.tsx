import { Link, useLoaderData } from "react-router";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";

interface TopicSummary {
  slug: string;
  name: string;
  group: "company" | "field" | "genre";
  definition: string;
  total: number;
  recent: number;
  indexable: boolean;
  latestAt: string | null;
}

export async function loader({ request }: { request: Request }) {
  return apiGet<{ topics: TopicSummary[] }>("/api/site/topics", { signal: request.signal });
}

export function meta() {
  return pageMeta({ title: "主題", description: "按公司與模型、技術方向、內容形態聚合的 AI 主題頁：OpenAI、Anthropic、Agent、多模態、論文與教程等 38 個方向。", path: "/topics", image: "/og/pages/topics.png" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

const GROUPS = [
  { key: "company", name: "公司與模型", blurb: "按廠商與模型系追蹤：誰發了什麼、又贏了哪一局" },
  { key: "field", name: "技術方向", blurb: "按技術領域深挖：Agent、多模態、具身智慧……" },
  { key: "genre", name: "內容形態", blurb: "按內容型別瀏覽：論文、教程、觀點、政策……" },
] as const;

export default function TopicsPage() {
  const { topics } = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <header className="pb-2 pt-5 lg:pt-1">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">按主題看 AI</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          按公司與模型、技術方向、內容形態瀏覽 <span className="num">{topics.length}</span> 個主題，持續彙集近期焦點與精選。
        </p>
      </header>
      {GROUPS.map((g) => (
        <section key={g.key} aria-labelledby={`topics-${g.key}`} className="pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id={`topics-${g.key}`} className="text-[15px] font-bold text-ink">
              {g.name}
            </h2>
            <p className="text-[12px] text-ink-4">{g.blurb}</p>
          </div>
          <ul className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {topics
              .filter((t) => t.group === g.key)
              .map((t) => (
                <li key={t.slug}>
                  <Link
                    to={`/topics/${t.slug}`}
                    prefetch="intent"
                    aria-label={`檢視${t.name}相關精選文章`}
                    className="card card-hover group flex h-full flex-col px-5 py-[18px]"
                  >
                    <span className="text-[15px] font-bold text-ink transition-colors group-hover:text-accent">{t.name}</span>
                    <span className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-[1.7] text-ink-3">{t.definition}</span>
                    <span className="mono mt-3 text-[11.5px] text-accent">
                      檢視 {t.total} 條精選 <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
