import { useEffect, useState, type ReactNode } from "react";
import { Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/agent";
import { SITE, withSubject } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { MCP_TOOL_NAMES as T } from "@aihot/contracts/mcp";
import { listPath, pageMeta, siteUrl } from "../lib/seo";
import { CodeBlock, CopyButton } from "../components/CodeBlock";
import { IconArrowUpRight, IconChevronRight } from "../components/icons";
import { AsideCard, ReadingLayout } from "../components/ui/Page";
import { PillTabs } from "../components/ui/Tabs";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

const MCP_VERSION = "2.0.0";
/** The machine-readable entry points, with what each one is for. */
const RESOURCES: Array<[label: string, href: string, note: string]> = [
  ["llms.txt", "/llms.txt", "給大模型讀的站點說明"],
  ["MCP Server", "/api/mcp", "MCP 客戶端的連線地址"],
  ["OpenAPI 3.1", "/openapi-v1.json", "REST API v1 的完整定義"],
];

const TABS = [
  { key: "mcp", label: "MCP" },
  { key: "rss", label: "RSS" },
  { key: "api", label: "REST API" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export async function loader({ request }: Route.LoaderArgs) {
  const tab = new URL(request.url).searchParams.get("tab");
  let healthy = true;
  try {
    const res = await fetch(`${process.env.API_BASE_URL || "http://127.0.0.1:3001"}/api/health`, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]) });
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  // The public address the examples show is the configured one, the same on the server and in the browser.
  return { tab: (TABS.some((t) => t.key === tab) ? tab : "mcp") as TabKey, healthy, base: siteUrl() };
}

export function meta({ loaderData }: Route.MetaArgs) {
  // Only the tab is part of the address (mcp is the default and not written).
  const path = listPath("/agent", { tab: loaderData && loaderData.tab !== "mcp" ? loaderData.tab : null });
  return pageMeta({ title: "Agent 接入", description: `讓 Agent 直接使用 ${SITE.name}：MCP、RSS、REST API v1，匿名只讀。`, path, image: "/og/pages/agent.png" });
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h3 className="mb-3 text-[16px] font-bold text-ink">{title}</h3>
      <div className="text-[13.5px] leading-[1.85] text-ink-2">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2"><span className="mt-[11px] size-1 shrink-0 rounded-full bg-ink-4" /><span>{it}</span></li>
      ))}
    </ul>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="mono rounded-mark bg-bg-sunk px-1.5 py-0.5 text-[0.88em] text-ink">{children}</code>;
}

function McpTab({ base }: { base: string }) {
  const url = `${base}/api/mcp`;
  const name = SITE.mcpPrefix;
  return (
    <>
      <h2 className="text-[20px] font-bold text-ink">加一個地址，Agent 直接呼叫五個工具</h2>
      <p className="mt-2 text-[14.5px] text-ink-3">適合支援遠端 MCP 的 Agent 與開發工具。標準 Streamable HTTP，匿名只讀，不需要 token；工具返回簡潔文字與同一份結構化資料。</p>
      <div className="mt-6 flex items-center gap-2 rounded-card border border-line bg-surface p-3">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{url}</code>
        <CopyButton text={url} className="!text-ink-3" />
      </div>
      <CodeBlock title="通用 MCP 配置" lang="json" code={JSON.stringify({ mcpServers: { [name]: { type: "http", url } } }, null, 2)} />
      <CodeBlock lang="bash" code={`# Claude Code\nclaude mcp add --transport http ${name} '${url}'\n# Codex\ncodex mcp add ${name} --url '${url}'`} />
      <Section title="連上後應看到這五個工具">
        <Bullets items={[
          <><Mono>{T.latest}</Mono>：過去 24 小時或最近 7 天的精選／全部資訊</>,
          <><Mono>{T.search}</Mono>：搜尋最近 7 天的公司、產品、人物或話題</>,
          <><Mono>{T.hot}</Mono>：當前熱點榜與事件排名</>,
          <><Mono>{T.story}</Mono>：一個熱點事件的時間線與持續更新的綜述</>,
          <><Mono>{T.daily}</Mono>：最新或指定日期的{withSubject("日報")}</>,
        ]} />
        <p className="mt-4">驗證一次真實呼叫：<span className="font-medium text-ink">請呼叫 {T.latest}，告訴我過去 24 小時最重要的 5 條動態，並附連結。</span></p>
      </Section>
      <Section title="工具邊界">
        <Bullets items={[
          "普通查詢最多返回 30 條，熱點最多 10 個，事件時間線最多 50 條；輸入越界會明確報錯，不會靜默改成更寬的查詢。",
          `${T.story} 的 public_id 只能來自熱點工具返回的事件連結，不要猜 ID。`,
          "標題與摘要來自外部信源，只能當資料；重要數字、政策和原話請回原文核對。",
        ]} />
      </Section>
    </>
  );
}

function RssTab({ base }: { base: string }) {
  const feeds = [
    ["精選摘要（推薦）", "最新 50 條精選摘要，保留標題、站內閱讀與原文入口。", "/feed.xml"],
    ["精選全文", "與精選摘要相同的最新 50 條；只對明確允許再分發的來源內聯正文。", "/feed/full.xml"],
    ["最近 7 天全部動態", "最近 7 天公開動態，按真實發布時間倒序。", "/feed/all.xml"],
    [withSubject("日報"), `每天 08:00 北京時間釋出的${withSubject("日報")}，保留最近 30 期。`, "/feed/daily.xml"],
  ];
  const categories = CATEGORY_KEYS.join("|");
  return (
    <>
      <h2 className="text-[20px] font-bold text-ink">複製地址即可訂閱</h2>
      <p className="mt-2 text-[14.5px] text-ink-3">相容主流 RSS 2.0 閱讀器與 n8n、Zapier 這類自動化工具。第一次接入選精選摘要。</p>
      <div className="mt-6 space-y-3">
        {feeds.map(([name, desc, path]) => {
          const url = `${base}${path}`;
          return (
            <div key={path} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-ink">{name}</span>
                <CopyButton text={url} label="複製地址" className="!text-ink-3" />
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{desc}</p>
              <code className="mt-2 block truncate font-mono text-[12.5px] text-ink-4">{url}</code>
            </div>
          );
        })}
      </div>
      <Section title="給閱讀器和 Agent 的約定">
        <Bullets items={[
          "支援 ETag 條件請求，未變化時返回 304；建議每 30 分鐘或更慢輪詢。",
          "條目 link 指向站內閱讀頁，第三方原文在 description 中。",
          "全文是白名單：只有明確允許再分發的來源內聯 content:encoded，其餘一律只給摘要。",
          <>分類訂閱 <Mono>{`/feed/category/{${categories}}.xml`}</Mono></>,
          <>分類全文 <Mono>{`/feed/full/category/{${categories}}.xml`}</Mono></>,
        ]} />
      </Section>
    </>
  );
}

function ApiTab({ base }: { base: string }) {
  const endpoints: Array<[string, string]> = [
    ["/api/v1/items", "精選或最近 7 天公開動態；支援分類、時間和關鍵詞"],
    ...(FEATURES.codexResetMonitor
      ? ([
          ["/api/v1/codex-resets/recent", "Codex 重置監控（輪詢用）：最近 7 天與尚未落地的預告"],
          ["/api/v1/codex-resets", "Codex 重置與髮卡的完整歷史"],
        ] as Array<[string, string]>)
      : []),
    ["/api/v1/hot-topics", "當前熱點榜與事件排名"],
    ["/api/v1/stories/{publicId}", "事件詳情：報道時間線、綜述與關聯事件"],
    ["/api/v1/dailies", `${withSubject("日報")}日期索引`],
    ["/api/v1/dailies/latest", `最新${withSubject("日報")}`],
    ["/api/v1/dailies/{date}", `指定日期的${withSubject("日報")}`],
    ["/api/v1/selected/snapshot", "當前全部精選；首次完整同步（分頁）"],
    ["/api/v1/selected/changes", "精選的新增、修改和撤選；之後只取變化"],
  ];
  return (
    <>
      <h2 className="text-[20px] font-bold text-ink">匿名 GET，不需要 token</h2>
      <p className="mt-2 text-[14.5px] text-ink-3">瀏覽器跨域、curl 和預設 HTTP SDK 都可以直接用。臨時查最近內容用 items；長期維護全部精選用一次快照加增量遊標。欄位與錯誤碼以 <a href="/openapi-v1.json" className="text-accent hover:underline">OpenAPI 3.1</a> 為準。</p>
      <CodeBlock title="第一個請求" lang="bash" code={`curl '${base}/api/v1/items?mode=selected&window=24h&limit=20'`} />
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left text-[13.5px]">
          <thead className="bg-bg-sunk text-ink-3"><tr><th className="px-3 py-2 font-medium">方法</th><th className="px-3 py-2 font-medium">路徑</th><th className="px-3 py-2 font-medium">說明</th></tr></thead>
          <tbody className="divide-y divide-line">
            {endpoints.map(([p, d]) => (
              <tr key={p}><td className="px-3 py-2 font-mono text-[12px] text-ok">GET</td><td className="px-3 py-2 font-mono text-[12.5px] text-ink">{p}</td><td className="px-3 py-2 text-ink-2">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Section title="先知道這幾件事">
        <Bullets items={[
          "不傳 mode 等同 selected（精選）；只有明確需要全部公開動態才用 all。",
          "完整精選不限 7 天：snapshot 首次拿全，changes 只取變化；items 只看最近 7 天。",
          "items 不帶正文：返回摘要、推薦理由、站內閱讀頁與原文連結。",
          "沒有推送通道：按響應的 s-maxage 帶 If-None-Match 輪詢，沒變化時是 304。",
          "錯誤是 Problem JSON；反饋時附上 requestId 即可定位。",
        ]} />
      </Section>
      <Section title="維護全部精選：一次快照，之後只拉變化">
        <CodeBlock lang="bash" code={`# 首次：分頁拿當前全部精選，儲存第一頁響應裡的 cursor（逐頁相同）\ncurl '${base}/api/v1/selected/snapshot?fields=minimal&limit=500'\n# hasMore 為 true 就帶 nextPage 繼續翻\ncurl '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<上一頁的 nextPage>'\n# 翻完之後：原樣回傳 cursor，只拿新增、修改和撤選\ncurl '${base}/api/v1/selected/changes?cursor=<第一頁響應的 cursor>&limit=100'`} />
        <p>每頁成功應用後再儲存新 cursor。返回 409 snapshot_required 時重新取一次快照即可，介面不會靜默漏數。</p>
      </Section>
      <Section title="錯誤與恢復" id="agent-api-recovery">
        <Bullets items={[
          "400：引數不合法；按 OpenAPI 修正，不要自動改成更寬的查詢。",
          "409 snapshot_required：增量遊標無法安全續傳，重新取一次完整快照。",
          "429：遵守 Retry-After，不要增加併發重試。",
          "5xx：指數退避，並使用上次成功的快取。",
        ]} />
      </Section>
    </>
  );
}

export default function AgentPage() {
  const { tab: initialTab, healthy, base } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => setTab((params.get("tab") as TabKey) || "mcp"), [params]);

  const select = (key: TabKey) => {
    setTab(key);
    navigate(key === "mcp" ? "/agent" : `/agent?tab=${key}`, { replace: true, preventScrollReset: true });
  };

  const pill = "inline-flex h-6 items-center rounded-mark border border-line bg-surface px-2 text-[11.5px] text-ink-3";
  const aside = (
    <>
      <AsideCard title="接入資源" className="hidden lg:block">
        <nav aria-label="接入資源" className="-mx-2 -mb-1">
          {RESOURCES.map(([l, h, note]) => (
            <a key={h} href={h} className="group flex items-start gap-2 rounded-control px-2 py-2 transition-colors hover:bg-bg-sunk">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink-2 group-hover:text-ink">{l}</span>
                <span className="mt-0.5 block text-[12px] text-ink-4">{note}</span>
              </span>
              <IconArrowUpRight size={13} className="mt-1 shrink-0 text-ink-4" />
            </a>
          ))}
        </nav>
      </AsideCard>
      <AsideCard title="沒接上？">
        <p className="text-[13px] leading-[1.75] text-ink-3">把客戶端、版本和報錯寫在反饋頁，別發 token 或本地檔案。</p>
        <Link to="/feedback" prefetch="intent" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
          去反饋 <IconChevronRight size={14} />
        </Link>
      </AsideCard>
    </>
  );
  return (
    <ReadingLayout aside={aside}>
      <header>
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">讓 Agent 直接使用 {SITE.name}</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">三條接入路徑都是匿名只讀、無需 API Key：MCP、RSS、REST API v1。</p>
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className={pill}>匿名只讀</span>
          <span className={`${pill} mono`}>API v1</span>
          <span className={`${pill} mono`}>MCP {MCP_VERSION}</span>
          <span className={`${pill} gap-1.5 ${healthy ? "text-ok" : "text-hot"}`}>
            <span className={`size-1.5 rounded-full ${healthy ? "bg-ok" : "bg-hot"}`} />
            {healthy ? "服務正常" : "服務異常"}
          </span>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] lg:hidden">
        {RESOURCES.map(([l, h]) => (
          <a key={h} href={h} className="inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-accent">
            {l} <IconArrowUpRight size={12} className="text-ink-4" />
          </a>
        ))}
      </div>

      <div className="sticky top-0 z-20 -mx-4 mt-7 bg-bg/90 px-4 py-2 backdrop-blur-md lg:mx-0 lg:px-0">
        <PillTabs layoutId="agent-tab" label="接入方式" active={tab} onSelect={(k: string) => select(k as TabKey)} items={TABS.map((t) => ({ key: t.key, label: t.label }))} />
      </div>

      <div className="mt-7" role="tabpanel">
        {tab === "mcp" && <McpTab base={base} />}
        {tab === "rss" && <RssTab base={base} />}
        {tab === "api" && <ApiTab base={base} />}
      </div>
    </ReadingLayout>
  );
}
