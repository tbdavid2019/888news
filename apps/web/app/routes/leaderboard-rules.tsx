// Public method statement for the leaderboard (method v17, docs/leaderboard.md).
// The copy states how rankings are actually computed; it changes only together with the method.
import { Link, useLoaderData } from "react-router";
import type { LbRulesData } from "@aihot/contracts/leaderboard";
import { SITE } from "@aihot/industry/site";
import { edgeTtl, loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta } from "../lib/seo";
import { pct } from "../features/leaderboard/format";
import { fullDateTime } from "../lib/format";
import { IconArrowLeft, IconChevronRight } from "../components/icons";
import { AsideCard, ReadingLayout } from "../components/ui/Page";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "leaderboard" };

export async function loader({ request }: { request: Request }) {
  return loadOr404<LbRulesData>("/api/site/leaderboard/rules", { request, signal: request.signal });
}

export function meta({ matches }: { matches?: unknown }) {
  return pageMeta({
    title: "模型榜評分與排名的計算方法",
    matches,
    description: `查看 ${SITE.name} 模型榜如何核驗配置、按能力維度分配權重、校準共同評測，並計算 ${SITE.name} 評分。`,
    path: "/leaderboard/rules",
    image: "/og/pages/leaderboard.png",
    jsonLd: breadcrumbLd([
      { name: "模型榜", path: "/leaderboard" },
      { name: "排序怎麼算", path: "/leaderboard/rules" },
    ]),
  });
}

export function headers() {
  return edgeTtl(600);
}

const STEPS = [
  {
    n: "01",
    title: "先核驗型號與運行配置",
    body: "統一模型名稱、版本與推理配置，按預先確定的規則選代表運行，不挑最高分。統一固定工具且全程同一型號可以採用；多模型回退、混合模型與專屬異構 Agent 系統不混排。配置未公開就保留未知，不據此斷言混用了模型。",
  },
  {
    n: "02",
    title: "按能力分配，重複依據不加權",
    body: "綜合榜按八個能力維度等權分配，每維佔 12.5%。維度內再分配到評測題族，同一題庫的重複成績、榜單切片與已用分項的綜合指標不疊加計權。新增評測先核對題目與協定的重疊關係。",
  },
  {
    n: "03",
    title: "用同協定參照校準真實分差",
    body: "只比較同一評測協定下雙方都有的成績，用預先固定參照組的四分位距校準連續分差，避免把微小領先和大幅領先都當成同一票。缺測不補分，未知標準誤差不當成零。",
  },
  {
    n: "04",
    title: "算成評分，方便比較",
    body: `彙總共同評測的相對成績差，尋找衝突較少的參考順序。在保持順序的條件下，將共同成績分差擬合為 0–100 的 ${SITE.name} 評分；各項原始成績供進一步核對。`,
  },
];

const FAQ = [
  {
    q: `${SITE.name} 評分怎麼看？`,
    a: "0–100 分，越高表示該模型在本榜的綜合表現越強。分數根據共同評測的實際分差擬合，不是按名次逐個扣分，也不會自動給榜首滿分。它不是正確率或勝率；請在同一榜單、同一輪內比較。",
  },
  {
    q: "為什麼不同名次可能同分？",
    a: "評分只顯示一位小數；差距很小，或各項評測存在衝突、無法用一個分數完全表達時，可能同分。此時仍按原來的共同評測排序，不額外編造 0.1 分的差距。",
  },
  {
    q: "參考名次能說明誰一定更強嗎？",
    a: "不能。它是當前公開成績在指定規則下的瀏覽順序，不是全世界所有任務的絕對能力排名。實際體驗還受產品版本、推理預算、工具環境與任務類型影響。相鄰名次不代表顯著差距。",
  },
  {
    q: "依據覆蓋百分比是什麼？",
    a: "它表示該模型已有成績覆蓋了多少預設評測權重。覆蓋高說明已知的範圍更廣，不代表能力更強，也不是正確率。缺失的份額不轉給其他評測，更不補成零分或平均分。",
  },
  {
    q: "共同評測的相對成績差是勝率嗎？",
    a: "不是。它彙總雙方共同評測中經過固定參照校準的連續分差，正負只表示相對方向，不表示獲勝概率或顯著領先。兩兩比較可能相互衝突，完整參考順序要同時處理這些關係。",
  },
  {
    q: "為什麼不直接取每個模型的最高成績？",
    a: "最高成績可能對應更高推理預算、不同工具或不同評測協定。代表配置的選擇規則必須先確定，不能看到結果後挑分。使用同一推理檔位名稱，也不保證計算量完全相同；具體配置在成績旁保留。",
  },
  {
    q: "評測重複、污染和誤差能全部消除嗎？",
    a: "不能。我們按公開題庫與協定檢查重複，並限制同一題族的份額；無法確認的題目重疊和訓練污染仍是局限。上游未公開樣本級結果或標準誤差時，無法補造可靠誤差，也不會把未知當成零。",
  },
  {
    q: "新模型什麼時候會出現？",
    a: `${SITE.name} 每天檢查四次上游結果。只有評測方實際發布了新模型的成績，才能用於參考順序；網頁重新整理、價格更新或我們的抓取時間，都不算重新評測。`,
  },
  {
    q: "某家榜單暫時打不開，會怎樣？",
    a: "仍有效的來源快照可繼續使用。相同評測版本內，臨時漏行最多沿用最近七天已核驗的記錄；仍在公開榜中保留的有效成績，不因數值長期不變被刪除。官方撤回、更正、換版會相應失效或替換，不保留歷史最高分。整輪計算失敗時保留上一輪有效榜及原時間。",
  },
  {
    q: "價格或速度會影響參考順序嗎？",
    a: "都不會。價格只供你了解 API 的使用成本，統一按每百萬 Token 展示，並保留廠商官方來源。它不代表訂閱費用。",
  },
];

const SECTIONS = [
  ["#rules-steps", "四步形成參考名次"],
  ["#rules-budgets", "依據怎麼分配"],
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
            ["/leaderboard/sources", "每一份評測依據"],
          ].map(([to, label]) => (
            <Link key={to} to={to!} viewTransition={to !== "/leaderboard"} prefetch="intent" className="flex items-center justify-between rounded-control px-2 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-bg-sunk hover:text-ink">
              {label}
              <IconChevronRight size={14} className="text-ink-4" />
            </Link>
          ))}
        </nav>
      </AsideCard>
    </>
  );
  return (
    <>
    <PhoneBar back={{ to: "/leaderboard", label: "模型榜" }} title="排序怎麼算" />
    <ReadingLayout aside={aside}>
      <Link to="/leaderboard" className="hidden items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        <IconArrowLeft size={14} /> 返回模型榜
      </Link>

      <header className="lg:pt-3">
        <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">排序怎麼算</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">了解 {SITE.name} 評分怎麼算，以及每個分數背後的公開成績。</p>
      </header>

      <section className="mt-6 rounded-panel border border-line-soft bg-bg-sunk px-6 py-7 dark:bg-bg-muted/40 md:px-10 md:py-9">
        <Eyebrow>EVIDENCE BEFORE CONCLUSIONS</Eyebrow>
        <h2 className="mt-2 text-[19px] font-bold text-ink">先看評分，再看所長。</h2>
        <p className="mt-2.5 text-[13px] leading-[1.8] text-ink-3">綜合榜與四類榜單最多展示 30 個模型。{SITE.name} 評分幫助快速比較；分項成績說明各有所長，依據覆蓋說明已有評測的範圍。</p>
        <p className="mt-1.5 text-[13px] leading-[1.8] text-ink-3">評分是基於公開評測折算的綜合比較指數，不是答題正確率，也不表示所有任務的絕對能力。具體用途請結合分項原始成績和運行配置。</p>
      </section>

      <ol id="rules-steps" className="mt-8 grid scroll-mt-[calc(var(--bar-h)+1.5rem)] gap-x-10 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="border-b border-line py-5">
            <span className="mono text-[11px] text-ink-4">{s.n}</span>
            <h2 className="mt-2 text-[15px] font-bold text-ink">{s.title}</h2>
            <p className="mt-1.5 text-[13px] leading-[1.8] text-ink-3">{s.body}</p>
          </li>
        ))}
      </ol>

      <section id="rules-budgets" className="mt-12 scroll-mt-[calc(var(--bar-h)+1.5rem)]">
        <Eyebrow>A BALANCED VIEW</Eyebrow>
        <h2 className="mt-2 text-[20px] font-bold text-ink">八個能力維度，各佔相同份額。</h2>
        <p className="mt-1.5 max-w-[64em] text-[13px] leading-[1.8] text-ink-3">
          程式設計、數學與推理、知識與事實、語言理解與指令、寫作與表達、視覺理解、專業任務、中文與多語言各佔 12.5%。這是均衡取向的公開選擇，不是通用能力的天然權重。每個維度先分配題族份額，再處理題族內的評測；同題重複不會增加總權重。已採用分項時，包含它們的綜合指標不再重複計入。缺失份額不轉給其他依據。
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="依據預算分配">
          {budgets.map((b) => (
            <li key={b.key} className="card flex flex-col p-4 lg:p-5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-ink">{b.name}</span>
                <span className="mono text-[20px] font-medium text-ink">{pct(b.weight)}</span>
              </span>
              <span className="mt-2.5 text-[11.5px] leading-[1.7] text-ink-4">{b.sources.length ? `本輪參與：${b.sources.join(" · ")}` : "本輪暫無可計入依據"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[64em] text-[12.5px] leading-[1.8] text-ink-3">
          程式設計、推理、知識、專業辦公四類榜單保留獨立入口，只比較對應能力的公開成績；分類評分與參考名次不能跨分類比較。公開評測來自同一機構時，不能當成多個獨立機構。更多評測只有補充不同的有效依據才有價值，數量本身不增加某個能力維度的總份額。
        </p>
      </section>

      <section id="rules-faq" className="mt-12 scroll-mt-[calc(var(--bar-h)+1.5rem)]">
        <h2 className="text-[20px] font-bold text-ink">你可能還想知道</h2>
        <div className="mt-3 border-t border-line">
          {FAQ.map((f) => (
            <Disclosure key={f.q} summary={f.q}>
              {f.a}
            </Disclosure>
          ))}
        </div>
      </section>

      <section id="rules-details" className="mt-10 scroll-mt-[calc(var(--bar-h)+1.5rem)] border-t border-line">
        <Disclosure summary="查看計算細節與當前版本">
          <div className="space-y-3">
            <p>
              方法版本：<code className="mono rounded-mark bg-bg-sunk px-1.5 py-0.5 text-[12px] text-ink-2">{run.methodologyVersion}</code>。模型身分、代表配置、題族歸屬、維度權重、參照組與計算輸入均保留版本。參考順序採用加權不完整 Kemeny 排序，最小化與共同評測相對成績差的衝突；只發布求解達到最優且滿足資格與連通條件的結果。可能存在多個同樣最優的順序，固定展示順序不代表已精確分開所有型號，數學求解最優也不代表真實能力順序已獲證明。
            </p>
            <p>
              每項評測先確認協定和方向，再以固定參照組在同協定下的四分位距（中間一半參照成績的跨度）校準連續分差。參照不是當前參榜模型的動態最高分或最低分；新增極端成績不會因此重新拉伸其他模型的尺度。至少有四個有效參照且四分位距大於零才可校準；不足時等待有效參照。方向統一後的原始分差除以凍結的四分位距，再截斷到 −1 至 1。它是相對成績差，不是天然能力單位。
            </p>
            <p>
              評分在參考順序確定後擬合：對每對共同評測的型號，以共同依據份額 W 加權，讓分數差儘量接近標準化的平均成績差 d，最小化 Σ W·(xᵢ−xⱼ−dᵢⱼ)²；同時約束 x 不與已發布順序反向。本輪有效參照型號的 x 均值固定為 0，再按 100 / (1 + 9⁻ˣ) 映射為 0–100 分，參照中心為 50、相差一個擬合單位對應 90 或 10。這個尺度是公開約定，不是測得的概率。不同分類、輪次及方法版本不直接比較；新增有效依據或參評型號可改變擬合分數，篩選頁面不會重新計算。
            </p>
            <p>
              加權擬合借鑑 <a href="https://arxiv.org/abs/0811.1067" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">HodgeRank 的成對比較思路</a>，本榜額外約束分數順序。它會壓縮衝突，不能把全部任務表現保真地濃縮成一個數字。擬合結果、實際參照和殘差隨計算輪次保存，未達到有效求解條件時不發布新輪次。
            </p>
            <p>
              標準誤差已公開時保留其誤差資訊；未公開時保留未知，不設為零，也不把標準化分差說成概率。缺測不補零、不補均值；共同依據不足或不連通時，不強行編造跨組的確定順序。覆蓋比例表示已覆蓋的評測權重，不能解釋成對最終參考名次的精確貢獻率。
            </p>
            <p>
              綜合榜至少需要三個來源、三個題族、三家機構、三個能力領域，並與至少兩個固定參照有直接可比成績。分類按其可用來源要求最多兩項來源和兩家機構、至少一個參照。發布超過十八個月的型號退出當前排序，已有詳情頁保留註明時間的歷史記錄。
            </p>
            <p>
              沒有逐題數據時不能把展開的模型對數量當成獨立樣本量。已公開的成績不涵蓋所有可能偏差，也不能替代對未知成績的研究。評分不附帶未經驗證的統計信賴度。
            </p>
            <p>
              固定參照型號：<span className="mono text-[12px] text-ink-2">{anchors.join("、")}</span>。參照組用於校準評測尺度，不指定任何廠商應排第幾。與評測協定一起凍結並保留版本，協定變化時重新核驗。
            </p>
          </div>
        </Disclosure>
      </section>

      <Link viewTransition to="/leaderboard/sources" className="mt-8 inline-flex items-center gap-1 text-[13.5px] font-medium text-accent hover:text-accent-ink">
        查看每一份評測依據 →
      </Link>
    </ReadingLayout>
    </>
  );
}
