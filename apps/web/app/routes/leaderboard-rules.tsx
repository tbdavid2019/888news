// Public method statement for the leaderboard (method v15, docs/leaderboard.md).
// The copy states how rankings are actually computed; it changes only together with the method.
import { SITE, withSubject } from "@aihot/industry/site";
import { Link, useLoaderData } from "react-router";
import type { LbRunInfo } from "@aihot/contracts/leaderboard";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta } from "../lib/seo";
import { pct } from "../features/leaderboard/format";
import { fullDateTime } from "../lib/format";
import { IconArrowLeft, IconChevronRight } from "../components/icons";
import { AsideCard, ReadingLayout } from "../components/ui/Page";

interface RulesData {
  run: LbRunInfo;
  budgets: Array<{ key: string; name: string; weight: number; sources: string[] }>;
  anchors: string[];
}

export async function loader({ request }: { request: Request }) {
  return loadOr404<RulesData>("/api/site/leaderboard/rules", { signal: request.signal });
}

export function meta() {
  return pageMeta({
    title: "共識指數計算方法",
    description: `檢視 ${SITE.name} 模型榜如何核驗公開成績、比較共同參評結果、處理缺失證據，並確定排名和 0—100 共識指數。`,
    path: "/leaderboard/rules",
    image: "/og/pages/leaderboard.png",
    jsonLd: breadcrumbLd([
      { name: "模型榜", path: "/leaderboard" },
      { name: "排名怎麼算", path: "/leaderboard/rules" },
    ]),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600" };
}

const STEPS = [
  {
    n: "01",
    title: "先確認，是同一個模型",
    body: "統一各家榜單的名稱和版本。同一模型的不同推理檔位只選一個代表配置，選擇規則預先確定，不挑最高分。匿名測試代號和混用其他模型完成任務的成績排除；已正式公開的 Preview 版本可以參加。",
  },
  {
    n: "02",
    title: "讓真正測過的模型相互比較",
    body: "只比較同一評測中的真實成績。雙方都有公開誤差時，誤差範圍內的微小差異更接近平局，不當成確定勝負。沒有測到，就沒有這一場比較。",
  },
  {
    n: "03",
    title: "先定票權，再彙總共同意見",
    body: "每項評測使用預先確定的預算。綜合榜至少要求三家評測機構、三個證據家族與三個專項覆蓋；同一來源重複抓取或展示切片，不會憑空增加票權。",
  },
  {
    n: "04",
    title: "尋找衝突最少的完整排名",
    body: "不同評測的意見可能衝突。我們選擇違背共同證據淨票權最少的一條順序，再單獨計算展示指數。缺測不補零分，也不猜測未公開的成績。",
  },
];

const FAQ = [
  {
    q: "為什麼有的模型證據較少，也能上榜？",
    a: "評測數量與能力是兩件事。綜合榜至少需要三家機構與跨能力證據。多數分類要求兩家機構，知識採用同一機構的兩項評測並明確說明。缺測不記零分，但仍可能造成偏差。",
  },
  {
    q: "“證據敏感”是什麼意思？",
    a: "刪去一項評測或一家機構、將單項權重上下調整 20%、或改變誤差處理後，名次範圍達到三名或以上、某些情景失去參評資格，或有對照未完成，就會提示證據敏感。詳情頁的情景範圍不是 95% 置信區間，不包含未知成績。",
  },
  {
    q: "前面的模型一定在兩兩比較中獲勝嗎？",
    a: "不一定。A 可能勝 B，B 勝 C，C 又勝 A。完整榜單要權衡這些衝突；非相鄰名次可能與單獨比較不同。數學最優表示按當前規則的總衝突最少，不表示已證明所有真實工作中的能力順序。",
  },
  {
    q: "為什麼排名可能和我的體驗不同？",
    a: "榜單彙集公開評測，反映這些證據支援的綜合能力。實際體驗還受產品版本、推理檔位、工具環境和長任務穩定性影響。我們會用新評測檢驗舊排名；分數接近時，不應把一兩名之差理解成明顯強弱。",
  },
  {
    q: "新模型什麼時候會出現？",
    a: `${SITE.name} 每天檢查四次上游結果。只有評測方實際釋出了新模型的成績，才能用於排名；網頁重新整理、價格更新或我們的抓取時間，都不算重新評測。`,
  },
  {
    q: "某家榜單暫時打不開，會怎樣？",
    a: "仍有效的來源快照可繼續使用。相同評測版本內，臨時漏行最多沿用最近七天已核驗的記錄；仍在公開榜中保留的有效成績，不因數值長期不變被刪除。官方撤回、更正、換版會相應失效或替換，不保留歷史最高分。整輪計算失敗時保留上一輪有效榜及原時間。",
  },
  {
    q: "綜合指數會和專項評測重複計分嗎？",
    a: "我們根據公開的題庫與方法說明檢查重疊，並限制相關來源的總份額；無法確認的相關性仍是侷限。當前 AA 指數佔 30%；Arena 整體文本與創作專項共享原有 10% 真人偏好份額，各佔 5%。兩項有重疊投票，因此仍算同一個證據家族，不假裝是兩家獨立評測。",
  },
  {
    q: "價格或速度會影響排名嗎？",
    a: "都不會。價格只供你瞭解 API 的使用成本，統一按每百萬 Token 展示，並保留廠商官方來源。它不代表訂閱費用。",
  },
];

const SECTIONS = [
  ["#rules-steps", "四步得出排名"],
  ["#rules-budgets", "證據怎麼分配"],
  ["#rules-faq", "常見問題"],
  ["#rules-details", "計算細節"],
] as const;

/** One question or detail block: a hairline row that opens in place. */
function Disclosure({ summary, children, defaultOpen = false }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="disclosure group border-b border-line" open={defaultOpen}>
      <summary className="flex items-center justify-between gap-3 py-4 text-[14px] font-semibold text-ink transition-colors hover:text-accent">
        {summary}
        <span className="shrink-0 text-[18px] font-normal leading-none text-ink-4 transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="max-w-[64em] pb-5 text-[13px] leading-[1.8] text-ink-3">{children}</div>
    </details>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="mono text-[11px] font-semibold tracking-[0.14em] text-accent">{children}</span>;
}

export default function LeaderboardRulesPage() {
  const { run, budgets, anchors } = useLoaderData<typeof loader>();
  const aside = (
    <>
      <AsideCard title="本頁內容" className="hidden lg:block">
        <nav aria-label="本頁內容" className="-mx-2 -mb-1">
          {SECTIONS.map(([href, label]) => (
            <a key={href} href={href} className="block rounded-control px-2 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-bg-sunk hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
      </AsideCard>
      <AsideCard title="當前方法">
        <dl className="space-y-2 text-[12.5px]">
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-4">方法版本</dt>
            <dd className="mono min-w-0 text-ink-2">{run.methodologyVersion}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-4">本輪計算</dt>
            <dd className="mono min-w-0 text-ink-2">{fullDateTime(run.generatedAt)}</dd>
          </div>
        </dl>
      </AsideCard>
      <AsideCard title="繼續看">
        <nav aria-label="繼續看" className="-mx-2 -mb-1">
          {[
            ["/leaderboard", "模型榜"],
            ["/leaderboard/sources", "每一份評測證據"],
          ].map(([to, label]) => (
            <Link key={to} to={to!} prefetch="intent" className="flex items-center justify-between rounded-control px-2 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-bg-sunk hover:text-ink">
              {label}
              <IconChevronRight size={14} className="text-ink-4" />
            </Link>
          ))}
        </nav>
      </AsideCard>
    </>
  );
  return (
    <ReadingLayout aside={aside}>
      <Link to="/leaderboard" className="inline-flex items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent">
        <IconArrowLeft size={14} /> 返回模型榜
      </Link>

      <header className="pt-3">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">排名怎麼算</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">綜合多家公開評測，瞭解排名背後的證據與方法。</p>
      </header>

      <section className="mt-6 grid items-center gap-5 rounded-panel border border-line-soft bg-bg-sunk px-6 py-7 dark:bg-bg-muted/40 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:px-10 md:py-9 lg:grid-cols-1 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <p className="mono text-[44px] font-medium leading-none tracking-[-0.04em] text-accent md:text-center md:text-[52px]">0—100</p>
        <div>
          <h2 className="text-[17px] font-bold text-ink">共同的證據，清楚的順序。</h2>
          <p className="mt-2.5 text-[13px] leading-[1.8] text-ink-3">綜合多家公開評測，在完整排名中儘量減少與已知成績的衝突。綜合榜和四類榜單都最多展示前 30 名。</p>
          <p className="mt-1.5 text-[13px] leading-[1.8] text-ink-3">
            共識指數把支援原排名的證據差異換算為 0—100，方便比較，不是正確率或能力差距的百分比。支援接近時可以同分，名次仍由完整證據決定。
          </p>
        </div>
      </section>

      <ol id="rules-steps" className="mt-8 grid scroll-mt-6 gap-x-10 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="border-b border-line py-5">
            <span className="mono text-[11px] text-ink-4">{s.n}</span>
            <h2 className="mt-2 text-[15px] font-bold text-ink">{s.title}</h2>
            <p className="mt-1.5 text-[13px] leading-[1.8] text-ink-3">{s.body}</p>
          </li>
        ))}
      </ol>

      <section id="rules-budgets" className="mt-12 scroll-mt-6">
        <Eyebrow>A BALANCED VIEW</Eyebrow>
        <h2 className="mt-2 text-[20px] font-bold text-ink">綜合測試、真人盲選、專項評測，一起看。</h2>
        <p className="mt-1.5 max-w-[64em] text-[13px] leading-[1.8] text-ink-3">
          綜合評測佔 30%，真人盲選佔 10%，各項專項評測合計佔 60%。新增評測先核對公開說明中的重疊關係，再從對應份額中分配；缺失份額不轉給其他評測。
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="證據預算分配">
          {budgets.map((b) => (
            <li key={b.key} className="card flex flex-col p-4 lg:p-5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-ink">{b.name}</span>
                <span className="mono text-[20px] font-medium text-ink">{pct(b.weight, 0)}</span>
              </span>
              <span className="mt-2.5 text-[11.5px] leading-[1.7] text-ink-4">{b.sources.join(" · ") || "—"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[64em] text-[12.5px] leading-[1.8] text-ink-3">
          程式設計、推理、知識、專業辦公分別尋找真實評測，分類分獨立計算。視覺理解與多語言證據繼續保留在綜合榜；調整分類名稱不會增加同一份成績的投票權。綜合分不等於分類分的算術平均。分類通常至少有兩項有效評測、五個可比較型號才展示。知識目前由 Epoch 的兩套評測支援，並明確說明同機構的侷限。創作偏好、網頁開發等證據繼續用於綜合榜，首版不單設審美和寫作榜。
        </p>
      </section>

      <section id="rules-faq" className="mt-12 scroll-mt-6">
        <h2 className="text-[20px] font-bold text-ink">你可能還想知道</h2>
        <div className="mt-3 border-t border-line">
          {FAQ.map((f) => (
            <Disclosure key={f.q} summary={f.q}>
              {f.a}
            </Disclosure>
          ))}
        </div>
      </section>

      <section id="rules-details" className="mt-10 scroll-mt-6 border-t border-line">
        <Disclosure summary="檢視計算細節與當前版本">
          <div className="space-y-3">
            <p>
              方法版本：<code className="mono rounded-mark bg-bg-sunk px-1.5 py-0.5 text-[12px] text-ink-2">{run.methodologyVersion}</code>。採用加權不完整 Kemeny 排序。每對共同參評模型彙總淨支援 M；目標是最小化所有被排反的淨支援之和。整數最佳化返回最優狀態和目標上下界，只有完整通過驗證的結果才用於正式釋出。
            </p>
            <p>
              雙方有明確標準誤時，淨支援取 2Φ(分差 / 合成標準誤) − 1，預設零協方差；其他比較只取原始領先方向。未知誤差並非零誤差，小分差按序數處理仍是侷限。票權針對潛在模型對，覆蓋型號多的來源會使用更多比較位置，不能把名義預算解讀為最終名次的精確貢獻率。
            </p>
            <p>
              展示指數保留原排序：逐對反轉相鄰模型的先後，允許其餘模型重排，計算最少增加的逆向淨支援。沿原排名累加這些非負支援差，再相對固定參照組用 sigmoid 對映到 0—100。替代順序同樣最優時保留零間距，顯示保留一位小數，不人為設定最低分差。指數不參與反向排序；入榜集合、參照型號與證據變化仍會影響指數，分差不等於真實能力距離。同代價求解固定型號 ID 次序；整數最佳化使用 HiGHS 求解器（highs 1.15.3），誤差換算的正態分佈函式與 SciPy norm.cdf 採用同一演算法；來源、協議、參評資格和每輪計算輸入均儲存版本。未連線到共同證據網路時不釋出跨分量的假精確順序。
            </p>
            <p>
              固定參照型號：<span className="mono text-[12px] text-ink-2">{anchors.join("、")}</span>。參照組用於指數尺度，不指定任何廠商應排第幾；不同分類的指數不直接比較。
            </p>
          </div>
        </Disclosure>
      </section>

      <Link to="/leaderboard/sources" className="mt-8 inline-flex items-center gap-1 text-[13.5px] font-medium text-accent hover:text-accent-ink">
        檢視每一份評測證據 →
      </Link>
    </ReadingLayout>
  );
}
