# 888news 更新日誌 (Changelog)

本專案遵循語意化版本（Semantic Versioning）與時序更新原則，記錄所有架構升級、功能迭代、UI/UX 優化與 Bug 修復。

---

## [2026-10-08]

### ⚡️ 升級 Clef 決策引擎至高效能節點 clef.create360.ai (Decision Engine Upgrade)

- **高效能節點遷移動態支援**：
  - 將 Tier 0 Clef-Flash 決策端點預設位址切換至高速節點 `https://clef.create360.ai/v1`。
  - 實測單次結構化推論延遲由原本約 5,100ms 大幅降至 130ms～300ms（加速 15~40 倍），顯著提升進線管線吞吐量。
- **路徑與模型參數正規化防禦**：
  - 自動偵測並標準化 `CLEF_BASE_URL`，無論結尾是否帶有 `/v1` 均自動相容至 `/v1/systemone`。
  - 自動相容模型別名（如 `Cloudflare/clef-flash` 自動映射至標準 `clef-flash`），杜絕 FastAPI Schema 驗證錯誤。

---

## [2026-10-07]

### 🌐 新增 Hacker News 官方 RSS 信源並存支援 (Sources & Ingestion)

- **Hacker News 雙軌信源並存**：
  - 保留既有 `hackernews100`（基於 hnrss.org 的高權重精選源），並新增官方即時信源 `hackernews-official`（`https://news.ycombinator.com/rss`）。
  - 得益於 Clef-Flash（Tier 0 免費決策引擎）之 5 維元數據前置裁決，HN 首頁約 60%~70% 的非 AI/非科技雜訊文章將在初篩直接短路拋棄（0 Groq Token 消耗），唯有入圍的重大 AI 熱點才會傳遞至後續模型寫作，實現高頻率抓取而無顯著 Token 成本。
- **RSS 相對路徑自動標準化容錯**：
  - 強化 `packages/backend/src/sources/rss.ts` 解析器，針對 RSS Feed 中少數未帶 domain 的相對路徑（如 Ask HN 討論連結）自動以 `feedUrl` 基礎網址解析為完整絕對路徑，提升候選文章擷取穩定性。

### ⚡️ Clef-Flash & TypeSafe Jev 決策引擎整合與大模型成本優化 (Decision Engine & Pipeline Overhaul)

- **三層級聯自動容災體系 (Tier 0 / Tier 1 / Tier 2 Cascade)：**
  - **Tier 0（本地自建 Clef-Flash）**：基於 Cloudflare/clef-flash 部署的本地 System One 決策服務，免授權金鑰、0 Token 費用，優先承載 100% 篩選與關係決策流量。
  - **Tier 1（雲端 TypeSafe Jev 備援）**：雲端極速決策模型（api.typesafe.ai/v1/systemone），延遲約 260ms；支援多把 API Key 輪換池與自動冷卻機制（402 額度用盡降級、429 自動退避），在 Clef 超時或併發滿載時無縫接管。
  - **Tier 2（常規大模型保底）**：當決策引擎全數不可用時，平滑回退至 Groq / Gemini / OpenAI 主模型，確保管線永不停擺。

- **擴充 1 & 2：全維度元數據一次判定（一呼五題）：**
  - 新文章進線時，在單次 Clef / Jev 請求中同時評估 5 個結構化維度：
    1. `relevance`：相關性門檻（`PASS` / `BLOCK` / `UNKNOWN`）。
    2. `attentionScore`：注意力初評（0~3 分有序評分，換算 0~100 分，低於 35 分直接短路拋棄，0 Groq Token 消耗）。
    3. `category`：網站主分類（`ai-models`、`ai-products`、`industry`、`paper`、`tip`、`opinion` 6 大分類）。
    4. `itemType`：題材格式（模型發布、產品更新、實用工具、論文研究、產業動態、專家觀點、教學解析 7 大題材）。
    5. `authorRole`：作者/報導視角（第一方官方發布 `principal`、獨立觀察評測 `observer`、媒體轉述編譯 `relayer`）。
  - **低分雜訊補全**：被短路拋棄的雜訊文章依然保留 Clef 裁決的主分類與分類標籤，保障資料庫檢索與統計完整性。

- **精選中文寫作 (Groq) 提示詞大幅瘦身：**
  - 將 Clef / Jev 事先裁決的 `itemType` 與 `authorRole` 作為權威前置判定傳入 `runUnderstand`，Groq 不再需要消耗推理算力猜測作者視角與題材類型，專注文筆潤色與正體中文標題、摘要生成。

- **事件歸組 (Event Grouping) 全面由 Clef 4選1 關係裁決接管：**
  - 將原本高昂的事件關聯 LLM 比對全面改由 Clef 執行 4 選 1 關係裁決：同事件 (`SAME_OCCURRENCE`)、進展 (`SAME_STORY`)、無關 (`UNRELATED`)、綜述 (`ROUNDUP`)。
  - 覆蓋新文章多候選事實批次比對（`judgeBatch`、`judgeSignal`）、雙向複核（`confirmMerge`）與故事根合併（`judgeStories`）。
  - 實測同事件裁決置信度 88.7%、無關裁決置信度 87.0%，事件歸組階段之 Groq Token 消耗降至 0。

- **管線防洪與 LLM 請求削減（預估降低 85%～90% 成本）：**
  - **單次評分機制 (`SCORE_CALLS=1`)**：將預設雙重打分改為單次打分（可由環境變數動態覆寫），打分階段直接省下 50% API 調用。
  - **雜訊短路防線 (Noise Short-Circuiting)**：評分低於 35 分（`NOISE_SCORE_CUTOFF=35`）的文章，全面跳過後續昂貴的 `structure`（實體抽取）與 `summarize/understand`（深度摘要寫作）。
  - **事件分組防洪過濾**：在 `processArticle` 階段，僅允許入選（`selected`）或評分達標（`score >= 45`）的文章推入事件分組佇列（`QUEUES.group`）。
  - **單篇報導故事跳過 Digest 重寫**：資料庫中 80% 的事件僅含 1 篇獨立報導，直接採用該報導摘要作為故事摘要；僅匯聚 2 篇以上不同報導時才觸發跨信源整合。
  - **事件摘要防抖延遲 (Debounce)**：將 `QUEUES.digest` 延遲時間由 60 秒延長至 600 秒（10 分鐘）。
  - **超時與併發控制**：`CLEF_TIMEOUT_MS` 設定為 45,000ms（45秒），內建併發信號量保護（`CLEF_MAX_CONCURRENCY=3`）。

---

## [2026-10-05]

### ⚙️ 後台管理與設定優化 (Admin & Integrations)

- **Webhook 刪除與清空支援**：
  - 修復後台系統設定中無法刪除已寫入之 Slack、Discord 與 Telegram Webhook 的問題，支援留白保存清空。
- **評測榜單與 API 相容性**：
  - 支援 `AA_API_KEY` 作為 `ARTIFICIAL_ANALYSIS_API_KEY` 之標準別名。
  - 修復 Vals AI Finance Agent Leaderboard 資料讀取異常（支援 `benchmarkViewUrl` 外部 JSON 格式，修正 `undefined.tasks` 錯誤）。
- **選拔門檻校準與信源分級**：
  - 微調精選門檻（T1_5 門檻調優至 60，T2 門檻調優至 68），平衡收錄品質與產業熱點敏感度。
  - 將 `ollama-release` 升級為 T1 官方信源。
- **日報報頭繁體化與統計修復**：
  - 修正日報模型發布數統計區塊名稱（支援繁體「模型發布」），解決發布數量顯示為 0 之統計異常。
  - 報頭「報」字字型在地化，使用 Noto Sans TC 重新生成正體報頭圖樣。

---

## [2026-10-04]

### 📊 數據統計與分析 (Analytics & Tracking)

- **Google Analytics 4 (GA4) 整合**：
  - 前台全站注入 Google Tag (`gtag.js`，評估 ID: `G-FYPFFMVB2F`)，提供精準造訪流量與讀者互動數據追蹤。

---

## [2026-10-01]

### 🚀 新增與架構升級 (Features & Architecture)

- **Docker GitHub Actions CI/CD 自動化與多架構支援 (GHCR Multi-Arch CI/CD)：**
  - 新增 `.github/workflows/docker-publish.yml`，每次推送到 `main` 分支時由 GitHub 官方託管 Runner 自動建置並推送映像檔至 GitHub Packages (`ghcr.io/tbdavid2019/888news`)。
  - 支援 `linux/amd64` 與 `linux/arm64` 雙架構（Multi-Arch），原生相容 AWS Graviton / ARM64 EC2 主機與 Apple Silicon。
  - 整合 GitHub Actions 雲端快取 (`cache-from/to: type=gha`)，重造映像檔速度提升 80% 以上。
  - 伺服器端 `docker-compose.yml` 預設直接拉取 `ghcr.io/tbdavid2019/888news:latest`，更新服務可在 10 秒內零編譯秒級完成。
- **全面採用 `2md.aiurl.tw` 專屬 Reader 並剔除 Jina：**
  - 廢棄所有 Jina Reader 依賴，所有網頁轉 Markdown 與動態爬取全數由 `https://2md.aiurl.tw` 接管。
  - 整合防驚群效應設計（Full Jitter Delay）與單機本地測試 stub 快速旁路。
- **Tibo (@thsottiaux) Codex 重置 Twitter 即時爬蟲監控：**
  - 後端監控模組實作 `collectPostsVia2md()`，透過 `2md.aiurl.tw/https://x.com/thsottiaux` 突破 Twitter 爬蟲防禦，即時抓取並解析推文與發布時間。
  - Worker 排程註冊 `monitor.tick` 定時巡檢，推文自動經 LLM 重點歸納後發布於前台 `/codex-reset` 專題頁面。
- **公開 RSS 訂閱連結支援：**
  - 在 `/all` 全部最新消息頁面桌面端與行動端頂部，新增醒目的「RSS 訂閱」按鈕，直接導向 `/feed/all.xml`，方便讀者以 Inoreader、Feedly、NetNewsWire 等閱讀器訂閱。
- **LLM 輸入上下文窗口擴展：**
  - 將長文分析與摘要的本文輸入截斷限制由 7,000 字擴增至 25,000 字，充分發揮現代長上下文大模型優勢，不再漏失長篇技術論文與發布會要點。
- **後台管理介面 100% 台灣繁體中文在地化：**
  - 服務端新增 `adminGet` 資料載入層自動繁簡轉換。
  - 前端 AdminLayout 裝載 `AdminAutoConverter` 智慧觀察器（MutationObserver + OpenCC），即時將所有後台頁面按鈕、表格、側邊欄、表單 placeholder 與動態 DOM 元素自動轉為台灣繁體中文，消除任何殘留簡體。
- **全方位通訊告警整合（Multi-Channel Alerting）：**
  - 新增支援 **Telegram Bot**（Chat ID + Bot Token）、**Slack Webhook** 以及 **Discord Webhook**。
  - 後台系統監控與異常通知支援自動多渠道分發與故障降級。

### 🌐 繁體中文在地化與模型提示詞優化 (Localization & LLM Prompts)

- **全面強制台灣繁體中文（正體中文）輸出：**
  - 更新系統所有核心 Prompt（`rules-domain.md`、`content-understanding.md`、`summarize-article.md`、`summarize-long-post.md`、`summarize-short-post.md`、`translate-body.md`、`translate-post.md`、`story-digest.md`、`report-daily-lead.md`、`report-period.md`）。
  - 嚴格指定模型在生成標題、摘要、推薦理由、事件綜述與日報時，一律採用台灣繁體中文，杜絕簡體字與中國大陸用語。
  - 內建台灣科技習慣用語對照表：
    - `信息` → `資訊`
    - `网络` → `網路`
    - `内存` → `記憶體`
    - `算法` → `演算法`
    - `程序员 / 开发者` → `工程師 / 開發者`
    - `软件 / 硬件` → `軟體 / 硬體`
    - `默认` → `預設`
    - `项目` → `專案`
    - `支持` → `支援`
- **前端 SSR 動態雙重繁簡轉換保障：**
  - 前端與公開 API 整合 OpenCC `cn -> twp`（台灣繁體科技常用語）轉換器，雙重確保歷史數據與動態內容呈現正體中文。
  - 徹底排查並消除所有前端路由（`/items/:id`、`/story/:id`、`/hot`、`/all`、分享海報等）中的殘留簡體中文標籤。

### 🎨 閱讀體驗與 Markdown 渲染美化 (UI/UX & Typography)

- **AI 摘要 Markdown 結構化排版（Human-Readable Formatting）：**
  - 優化 Prompt 規範，要求導語直奔核心事件，核心名詞與版本號加粗（如 `**Gemini 4 Argon**`），關鍵指標與定價以無序列表（`- **要點**：...`）呈現。
  - 新增前端 `formatArticleSummary()` 結構化解析器，為純文字摘要智慧拆分導語與項目清單。
  - 引入 `.prose-summary` 專屬樣式體系，調優行高、段落間距、清單點位及標題層級，大幅提升人類閱讀流暢度。
  - 卡片預覽引入 `stripMarkdown()`，去除換行與語法噪訊，保留整潔的雙行導讀預覽。
- **介面去噪與簡化：**
  - 移除不適用的 WeChat 公眾號二維碼與側邊欄廣告區塊。
  - 隱藏行動端無效的底部懸浮導航欄，釋放螢幕視野。

---

## [2026-09-30]

### ⚙️ 後端與模型配置 (Backend & Model Fallback)

- **多模型備援調用鏈（Multi-LLM Fallback Engine）：**
  - 實現 LLM 調用智慧輪替機制：當主模型配額耗盡（429 Too Many Requests）或超時報錯時，毫秒級無縫切換至備援模型（如 `openai/gpt-4o-mini` → `deepseek/deepseek-chat`）。
  - 對接回執（Receipts）與預算保護機制，保證計費精確與成本可控。
- **雲端部署與自動化：**
  - 成功部署至 `office.fanpokka.ai`，獨立綁定專屬網域 `https://news2.david888.com`。
  - Docker Compose 容器化編排（web、api、worker），支援零停機無縫熱重載。
