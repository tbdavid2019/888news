# 888news 更新日誌 (Changelog)

本專案遵循語意化版本（Semantic Versioning）與時序更新原則，記錄所有架構升級、功能迭代、UI/UX 優化與 Bug 修復。

## [2026-10-24] — 🏷️ 歷史文章主題標籤精準回填工具 (Topic Tags Backfill Engine) 與線上資料回填完成

### 🏷️ 歷史文章主題標籤自動化回填腳本 (`scripts/backfill-topic-tags.ts`)
- **歷史庫存標籤回填工具**：
  - 新增 [`scripts/backfill-topic-tags.ts`](scripts/backfill-topic-tags.ts)，專門用於新增主題與分類體系後的歷史文章追溯打標。
  - 支援 `--dry-run` 模式，可預先統計候選篇數並預覽匹配標題，避免誤打標籤。
  - 採用高精度正則與詞義過濾，杜絕中文多義詞誤判（例如排除單獨「核心」、「執行環境」與單純提及「NVIDIA」非硬體文章的誤傷）。
  - 同步更新 `publications.tags` 與 `analyses.tags`，確保快取重整後各主題頁面文章數精準呈現。
  - `package.json` 新增便利指令 `npm run db:backfill-tags`。

### 🚀 線上生產環境回填成果
- **8 大新主題已全面 Populate，告別「0 條」冷啟動狀態**：
  - **資訊安全 (infosec)**：成功回填 **72 篇**（重大 CVE 漏洞、零日利用、RCE 與攻防）
  - **硬體/半導體 (hardware)**：成功回填 **42 篇**（晶片、GPU、台積電先進製程）
  - **數位權益 (digital-rights)**：成功回填 **33 篇**（隱私權保護、科技反壟斷、開放網路）
  - **系統架構 (systems)**：成功回填 **18 篇**（Linux、作業系統、分散式架構與儲存引擎）
  - **程式語言 (languages)**：成功回填 **11 篇**（Rust、TypeScript、Common Lisp、編譯器與 Runtime）
  - **開發工具 (dev-tools)**：成功回填 **10 篇**（終端 CLI/TUI、Neovim、套件管理）
  - **前沿科學 (science)**：成功回填 **8 篇**（量子計算、分子機器、硬科技突破）
  - **獨立開發 (indie-dev)**：成功回填 **4 篇**（微型 SaaS、自託管與 Indie Hackers）
- 線上主題頁面（如 `https://news2.david888.com/topics/infosec` 等）均已即時更新上線。

## [2026-10-24] — 🐦 X (Twitter) 採集引擎升級為 SSR GraphQL 全量解析 & 主題資料庫自啟動同步

### 🐦 X (Twitter) 採集引擎升級與正則缺陷徹底修復
- **定位並修復 `orca_build` 等 X 帳號採集遺漏根因**：
  - **舊版正則與 Markdown 缺陷**：舊有採集透過 2md 的純文字 Markdown 模式，推文的時間戳與狀態網址在轉換過程中被剝離；而 `x.ts` 的區塊篩選依賴 `https://x.com/.../status/(\d+)` 或 `media/(\d{15,22})`，但推文配圖多為英數雜湊檔名（如 `media/HVVxZF-bgAArUjg`，非純數字），純文字推文更無數字特徵，導致所有無影片縮圖的推文被全部判定無效拋棄，僅有極少數命中影片的舊推文入庫，進而因游標推進導致後續推文徹底停止採集。
- **全新雙軌擷取架構 (SSR GraphQL + Resilient Markdown Fallback)**：
  - **首選軌道：SSR GraphQL 串流原生解析**：新增 `readPageAsHtml` 搭配 `X-Respond-With: html`，直接自 Twitter SSR 注入的 `$R[...]` 腳本中解析 `profile_user_originals_timeline` / `timeline_response` 的 GraphQL 資料結構。
  - **零損失提取**：完整擷取全量推文文字（支援長推文 `note_tweet` 全文）、高畫質相簿與影片清單、精確毫秒發布時間戳、讚數/轉發數/閱讀數，並自動略過置頂推文（`TimelinePinEntry`）。
  - **容錯備援軌道**：若頁面未帶 SSR JSON，自動切換 Markdown 備援解析，放寬狀態網址匹配支援相對路徑 `/status/(\d+)` 與 ID 對位分配機制。
- **信源輸入 URL 防呆與自動清理 (Input Sanitization)**：
  - `CreateSchema` 與 `extractHandle` 全面支援貼入完整個人頁網址（如 `https://x.com/orca_build/`、`https://twitter.com/orca_build`）或帶有 `@` 之字串，自動提取為合法純淨之帳號 handle。
  - 新增單元測試 [`tests/source-id.test.ts`](tests/source-id.test.ts) 驗證各類 URL、handle 與正則匹配。

### 🔄 主題資料庫自啟動熱同步 (Startup Topics Auto-Sync)
- **容器啟動自動熱同步**：
  - 在 `apps/api/src/main.ts` 服務啟動流程中加入 `seedTopics()`，確保每當 CI/CD 或 Watchtower 部署新版 Docker 映像檔並重啟服務時，Postgres `topics` 資料表即刻與 `industry/topics.json` 同步（自動補齊新主題與關聯），解決過往必須手動執行 `setup` 容器才能寫入資料庫的盲區。
- **主題首頁文案與中繼資訊優化**：
  - 更新 `/topics` 頁面 Meta 說明與標題，移除過去寫死「38 個方向」與「按主題看 AI」等舊文案，調整為涵蓋資訊安全、系統架構、程式語言與開發工具等全領域的「按技術與主題瀏覽」。

## [2026-10-24] — 🛡️ 全資訊世界資安與 Hacker News 級底層工程主題體系全面升級 & Mermaid 圖表原生渲染

### 📊 Mermaid 流程圖與架構圖動態渲染引擎 (On-Demand Mermaid Hydration)
- **支援文章正文 Mermaid 原生渲染**：
  - 針對長文與 Podcast 文章（如 `pod_866d25e49f62d9b1`）內嵌的 `flowchart`、`sequenceDiagram`、`classDiagram`、`stateDiagram`、`erDiagram` 等架構圖代碼塊，自動轉換為高品質向量 SVG 圖表呈現。
- **隨選延遲載入 (On-Demand Dynamic Import)**：
  - 核心主頁與無圖表文章保持 0KB Mermaid 體積負擔；僅在偵測到 Mermaid 語法代碼塊時，才以動態 `import("mermaid")` 延遲載入渲染引擎。
- **全主題自適應、嚴格沙箱安全與容錯雙軌 (Strict Security, Mobile RWD & Resilient Fallback)**：
  - 嚴格啟用 `securityLevel: "strict"` 沙箱，杜絕第三方信源內嵌惡意腳本（XSS）風險。
  - 行動端優化：配置 `.mermaid-container svg { min-width: fit-content }` 搭配水平捲動，徹底解決手機端複雜圖表被縮成微字無法閱讀的問題。
  - 自動偵測系統與網站的淺色/深色主題 (`data-theme`)，並透過 `MutationObserver` 在切換主題時即時重繪圖表配色。
  - 保留原始 code 區塊，若圖表語法解析失敗時自動優雅降級顯示純代碼，絕不造成畫面崩潰或文字遺失。
  - 新增單元測試 [`apps/web/tests/mermaid.test.ts`](apps/web/tests/mermaid.test.ts) 驗證各類 Mermaid 語法、YAML Frontmatter、註解與常規程式碼之高精度識別。

### 🛡️ 拒絕「AI」前綴與概念偏差：重構「資訊安全 (Infosec)」為獨立核心維度
- **切割模型道德與真正資安**：
  - 將原先偏向 LLM 價值觀對齊、越獄與有害內容過濾的 `safety`（安全與對齊）限縮於純模型認知層面。
  - 拒絕濫用「AI」字眼，回歸全電腦科學與網際網路世界的純粹硬核資安，新增獨立主題 `infosec`（資訊安全與隱私）。
  - 全面納管全球重大 CVE 與零日漏洞（0-day）、遠端代碼執行（RCE）、記憶體安全（Use-after-free/Buffer overflow）、系統應急修補、逆向工程、密碼學防護與數位隱私監控。

### 🌐 對標 Hacker News 深度：全方位擴充 8 大底層系統與工程主題 (`industry/topics.json`)
- **比照 Hacker News 社群關切的實體科技與工程命脈，新增 8 大專業主題**：
  1. `infosec`（**資訊安全與隱私**，field）：CVE 追蹤、零日漏洞、底層利用、安全修補與隱私防禦。
  2. `systems`（**系統與底層架構**，field）：作業系統核心（Linux Kernel/BSD）、分散式架構（Raft/Paxos）、資料庫儲存引擎（Postgres/SQLite/ClickHouse）、網路協定（DNS/QUIC/HTTP3）與容器虛擬化。
  3. `languages`（**程式語言與編譯器**，field）：Rust、Go、Zig、C/C++、Python、TypeScript 等語言設計演進、編譯器架構（LLVM/JIT）、Runtime 引擎與型別系統。
  4. `dev-tools`（**開發工具與終端**，field）：終端生態（CLI/TUI/zsh/tmux）、現代編輯器（Neovim/Helix）、套件管理與建置系統（Cargo/uv/Vite/Nix）及 Unix 哲學工具。
  5. `hardware`（**硬體與半導體**，field）：運算晶片與架構（GPU/TPU/CPU/RISC-V/ARM/Apple Silicon）、半導體先進製程（台積電/ASML）、嵌入式系統與單板電腦。
  6. `indie-dev`（**獨立開發與產品**，field）：獨立開發者（Indie Hackers）、Show HN 作品、Side Projects、微型 SaaS 創業、自託管（Self-hosting）與開放網路精神。
  7. `science`（**前沿科學與硬科技**，field）：生物醫學、量子計算、能源與資料中心電網、航太工程與應用數學突破。
  8. `digital-rights`（**數位權益與開放網路**，genre）：科技巨頭反壟斷、隱私監控法案爭議、開源授權糾紛、自由軟體哲學與開放網路防衛。

### 🏷️ 標籤體系 (`industry/taxonomy.ts`) 與全網語料同義詞映射大幅增強
- **新增 8 個正統科技領域主題標籤**：
  - `TOPIC_TAGS` 擴充納入：`資訊安全`、`系統架構`、`程式語言`、`開發工具`、`硬體/半導體`、`獨立開發`、`前沿科學`、`數位權益`。
- **建置完整的全領域多語同義詞對照庫 (`TAG_SYNONYMS`)**：
  - 資安領域：`cve`, `cves`, `漏洞`, `零日`, `0-day`, `0day`, `rce`, `提權`, `滲透測試`, `逆向工程`, `密碼學`, `供應鏈安全`, `駭客`, `安全防護`, `安全扫描` 等自動統一對照為 `資訊安全`。
  - 系統基建：`kernel`, `linux`, `ebpf`, `分布式系统`, `操作系统`, `数据库`, `网络协议`, `容器`, `docker`, `k8s` 自動統一對照為 `系統架構`。
  - 語言與工具：`rust`, `golang`, `zig`, `c++`, `compiler`, `runtime`, `cli`, `tui`, `neovim`, `vim` 等精確收斂至對應標籤。
  - 獨立開發與硬體：`indie hacker`, `show hn`, `side project`, `自托管`, `gpu`, `cpu`, `risc-v`, `arm`, `芯片` 自動映射為標準科技標籤。

### 🤖 模型內容理解與品味評分提示詞校準 (`industry/prompts/`)
- **`content-understanding.md`**：同步更新標籤白名單，賦予模型識別系統底層架構、重大漏洞與開發生態的主題打標能力。
- **`selection-score.md`**：在「必須正常評價的價值」中明確納入重大 CVE、基礎設施漏洞修補、系統核心突破、編譯器演進與獨立開發優秀代表作，杜絕評分模型將硬核工程與資安報告誤判為邊緣噪聲。

---

## [2026-10-17] — 🌐 Git 遠端存儲庫綁定與 JetBrains Mono + Gen Jyuu Gothic（源柔黑體）字體升級

### 🌐 Git 遠端倉庫綁定與遠端優先同步 (Git Remote Synchronization)
- **遠端關聯**：配置並綁定官方 GitHub 倉庫 `https://github.com/tbdavid2019/888news.git`，設定 `main` 分支追蹤 `origin/main`。
- **一致性同步**：以遠端倉庫作為唯一事實來源（Single Source of Truth），維持乾淨工作樹並建立平滑追蹤。

### 🎨 排版系統升級：JetBrains Mono + Gen Jyuu Gothic（源柔黑體）(Typography Redesign)
- **Google Fonts JetBrains Mono 可變字型整合**：
  - 更新全站 Google Fonts 載入規格為 `JetBrains Mono:ital,wght@0,100..800;1,100..800`，完整支援全區間字重與斜體樣式。
  - 於全站基礎樣式與文字元素啟用 `font-optical-sizing: auto`，根據字型尺寸自動微調筆畫粗細與間距，提升小字號與大標題的光學可讀性。
  - 提供 `.jetbrains-mono` 工具類別（包含 `font-family: "JetBrains Mono", monospace; font-optical-sizing: auto; font-style: normal;`）。
- **Gen Jyuu Gothic（源柔黑體 / 源柔ゴシック）真實 Webfont 網路字型實體封裝**：
  - 徹底解決原先僅依賴 `local(...)` 本地映射導致客戶端未安裝字型時無法啟用的問題。
  - 引入 `@fontsource/genjyuu-gothic`，於 Vite 建置管線中直接內嵌 400（Regular）、500（Medium）、700（Bold）三種字重的 WOFF2 實體字型檔。
  - 於 `@font-face` 建立「本機優先載入（0ms 零網路延遲）+ 伺服器/CDN WOFF2 自動備援」雙軌機制，使任何裝置（手機、平板、未安裝該字型之 Mac/Windows 電腦）皆能 100% 成功套用源柔黑體。
  - 同步將 `--font-sans` 與 `--font-mono` 正式對齊 `"Gen Jyuu Gothic"` 與 `"Genjyuu Gothic"`，並支援 `font-display: swap` 確保首屏無阻斷秒開。
- **等寬字型棧強化**：
  - `--font-mono` 升級為包含 `"JetBrains Mono", "Gen Jyuu Gothic", "Genjyuu Gothic", "Gen Jyuu Gothic Monospace", "Genjyuu Gothic Monospace", "源柔ゴシック等幅"`，兼顧程式碼排版與中英混排等寬對齊。

### 🛡️ Podcast 原生自主管線與 YouTube Atom RSS 雙軌備援 (Autonomous Fallback Architecture)
- **YouTube 官方 Atom XML 原生解析引擎**：
  - 升級 [`packages/backend/src/sources/podcast-rss.ts`](packages/backend/src/sources/podcast-rss.ts)，完整支援 YouTube 官方 Atom RSS 結構（`<feed>` / `<entry>` / `yt:videoId` / `media:group` / `media:description` / `media:thumbnail`）。
  - 無需任何第三方 API Key 或中繼服務，直連 YouTube 官方公開 RSS 端點（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）。
- **徹底解耦 BigGo 單點故障（斷炊零影響）**：
  - 升級 [`packages/backend/src/sources/podcast-sync.ts`](packages/backend/src/sources/podcast-sync.ts)，建立多路候選來源容錯機制（Candidate Feed Failover）：優先檢索官方 Audio RSS，遇逾時或連線失敗自動平滑切換至官方 YouTube Atom RSS。
  - 修正原生 RSS 入庫權重與評分：由 RSS / YouTube 原生抓取的單集一律賦予精選權重（`selected = true, score = 85`），確保即便 BigGo 斷炊或限速，原生單集亦能 100% 自動進駐首頁、全部動態與 Podcast 推薦清單。
- **超大容量 Feed 緩衝與連線容錯 (Large RSS Payload Tolerance)**：
  - 將 Feed 抓取之 `maxBytes` 上限由預設 8MB 擴增至 32MB，並將連線逾時提升至 25 秒，完美支援如 Substack（長達數年全文內嵌、大小達 14.6MB）等超大單一 RSS Feed。
- **頻道庫 YouTube 關聯補齊**：
  - 更新 [`industry/podcasts.json`](industry/podcasts.json) 中多個頂級頻道的 `youtube_channel_id`（如 Latent Space、The Road to Autonomy、Lex Fridman、硅谷101、WhynotTV 等）。
- **新增 CLI 同步工具與獨立離線驗證**：
  - 新增 [`scripts/sync-podcast-feeds.ts`](scripts/sync-podcast-feeds.ts)，支援手動觸發全量雙軌同步與 `--skip-biggo` 獨立原生驗證模式，並於 EC2 正式環境完成 `--skip-biggo` 實機獨立抓取驗證。

---

## [2026-10-16] — 🎙️ PigeonPod 伺服器整合、YouTube 轉 Podcast 原生 RSS 雙向備援與 100% 信源全覆蓋

### 🕊️ PigeonPod 自建音訊串流服務整合 (PigeonPod YouTube-to-Podcast RSS Bridge)
- **連線與整合內網伺服器 (`10.9.0.99`) PigeonPod 服務**：
  - 成功連線並檢視本機內網伺服器運行的 PigeonPod 實體（`iipod.david888.com`），透過 API 自動納管與同步清單中的中文 YouTube 影音頻道。
  - 將 12 檔中文頻道（含《硅谷101》、《WhynotTV Podcast》、《M亿财富MEmoney》、《小Lin说》、《张小珺Jùn｜商业访谈录》、《罗永浩的十字路口》、《Koji杨远骋》、《疯投圈》、《CLS同学》、《42章经》、《晚点LatePost》等）與《Stripe Sessions》全數登錄至 PigeonPod。
  - PigeonPod 自動使用 `yt-dlp` 下載音訊（AAC/M4A）並即時生成符合 iTunes 標準的播客 XML RSS Feed 與音訊串流位址（`https://ipod.david888.com/media/...`）。
- **實現 100% 全量 99 檔頻道 RSS 雙向備援**：
  - 補齊原先無官方傳統音訊 RSS 的純 YouTube 影音頻道（《硅谷101》、《WhynotTV Podcast》、《M亿财富MEmoney》、《Stripe Sessions》），將其 `feed_url` 直接對接 PigeonPod 專屬 RSS 端點。
  - 全站 99 檔關注頻道達到 100% 原生 RSS 覆蓋，徹底消弭任何單一上游斷炊風險。

### 📡 官方 Podcast 原生 RSS 雙向備援與斷炊容錯架構 (Official RSS Fallback & Decoupling)
- **97 檔官方 RSS Feed 補齊**：
  - 透過 Apple Podcast Search API 檢索並全量驗證 97 檔核心頻道的官方原生 XML RSS Feed，填入 [`industry/podcasts.json`](industry/podcasts.json)。其餘 3 檔為 YouTube 原創視頻頻道，保持獨立標記。
  - 徹底解除對單一上游 BigGo API 的強相依性，建立去中心化的官方信源底層。
- **雙向備援與平滑合流 (`syncPodcastFeeds`)**：
  - 在 [`packages/backend/src/sources/podcast-sync.ts`](packages/backend/src/sources/podcast-sync.ts) 升級雙向備援邏輯：若 BigGo 服務離線、逾時或被限速，官方 RSS 抓取管線自動獨立運行，即時入庫新單集並排版正文，絕不斷炊。
  - **音訊串流與時長無損增強**：對於已由 BigGo 入庫的單集，官方 RSS 掃描時自動匹配並注入真實 MP3 enclosure 串流網址與精確秒數，兼得高品質中文長文與原汁原味音訊播放。
- **智慧實體與上市公司代碼關聯 (`associateEntitiesAndTickers`)**：
  - 針對原生 RSS 提取的單集內容，自動掃描 [`industry/taxonomy.ts`](industry/taxonomy.ts) 實體詞庫與別名，自動綁定美股與台股代碼至 `podcast_episode_tickers`，無縫融入即時股市行情卡片。
- **資料庫種子指令升級**：
  - 更新 [`scripts/seed-podcasts.ts`](scripts/seed-podcasts.ts)，於寫入與衝突更新時全面持久化 `feed_url`、`site_url` 與 `youtube_channel_id`。

### 📚 Podcast 智庫 5,000 字深度長文全量入庫與摘要截斷修復 (Deep Intel Ingestion & Truncation Guard)
- **直連單集詳情端點**：
  - 單集同步時向 BigGo `/detail` 端點拉取 5,000+ 字結構化深度特刊，完整入庫 Markdown 章節、導讀與脈絡分析，並於文章內頁直接以 `fulltext` 模式排版呈現。
- **摘要語意完整性與截斷防禦**：
  - 針對上游 300 字硬切殘句，自動採用完整首段或 `quick_take` 替代；前端摘要排版函數新增子句語意檢驗，過濾逗號與懸掛片語結尾之殘句，並自動規範補上句號。

### 🎨 介面視覺與導航標題去 AI 精簡化 (Clean Navigation & Tab Titles)
- **去除冗餘「AI」字眼**：
  - 側邊導航選單中，「全部AI 動態」精簡為「全部動態」，「AI 日報」精簡為「日報」。
  - 日報頁面網頁標籤（Browser Tab Title）由「AI 日報 888news」精簡修正為純粹簡潔的「888news」。

---

### 🛡️ Cloudflare Edge 反向代理與 BigGo 雙重容錯架構 (Edge Proxy & Datacenter Anti-Rate Limiting)
- **突破 AWS 機房 IP 限制 (HTTP 429 Rate Limit Exceeded)**：
  - **根本原因**：遠端伺服器（AWS EC2 IP `35.163.156.107`）直接向 BigGo API 請求時，會被 BigGo 端的 Envoy 閘道判定為資料中心 IP 而強制攔截並回傳 HTTP 429。
  - **邊緣代理架構**：於 Cloudflare 部署專屬 Edge 反向代理服務（`biggo-podcast-proxy.oobwei.workers.dev`），藉由 Cloudflare 全球 Anycast 邊緣網路節點轉發請求，徹底規避機房 IP 限制。
  - **多層級聯輪循容錯**：在 [`packages/backend/src/sources/podcast-sync.ts`](packages/backend/src/sources/podcast-sync.ts) 實作雙重降級保護，優先走 Cloudflare Edge 代理端點，若遇網路抖動或異常則透明回退至直接連線，並內建指數退避重試與詳細偵錯日誌。

### 🔄 Podcast 定時自動抓取與線上單集成功刷新 (Automated Ingestion & Sync Verification)
- **Worker Cron 排程常駐自動同步**：
  - 在背景工作排程（[`apps/worker/src/schedules.ts`](apps/worker/src/schedules.ts)）中將 BigGo Podcast 單集同步正式納入每 30 分鐘執行一次的 `syncPodcastFeeds`。
  - 伺服器端實測批次同步成功寫入 200 檔全新熱門單集（`{ total: 200, inserted: 200 }`），完全消除資料無更新的問題。
- **線上即時資料驗證**：
  - 線上端點 `/podcast/recommend` 與 `/api/site/podcast/recommend` 資料即時刷新至當日（2026-10-15），涵蓋：
    - *All-In with Chamath, Jason, Sacks & Friedberg* (2026-10-15 02:41:18Z)
    - *张小珺Jùn｜商业访谈录* (2026-10-15 00:49:30Z)
    - *Bloomberg Businessweek* (2026-10-14 22:49:12Z)
    - *晚点聊 LateTalk* (2026-10-14 22:30:00Z)
    - *Latent Space* (2026-10-14 20:34:51Z)

### 📊 後台「需要核對的付費收據」新增「發生時間」 (Admin Receipts Timeline)
- **精確時間戳欄位**：
  - 在後台「需要核對的付費收據」列表（[`apps/web/app/routes/admin/runs.tsx`](apps/web/app/routes/admin/runs.tsx)）中，於「狀態」與「服務」之間正式新增「發生時間」欄位。
  - 支援相對時間友善展示（如「15分鐘前」），滑鼠懸停（tooltip）即顯示完整精確 ISO 時間戳，利於管理員即時核對異常調用與計費事件。

### 🎙️ 後台信源管理：Podcast 頻道標識與即時抓取/預覽修復 (Admin Source Diagnostics)
- **Podcast 智庫專屬識別標籤**：
  - 在後台信源管理（[`apps/web/app/routes/admin/sources.tsx`](apps/web/app/routes/admin/sources.tsx) 及 [`source.tsx`](apps/web/app/routes/admin/source.tsx)）中，針對 `pod_*` 信源標記專屬「Podcast 智庫」徽章，並提供清楚的排程同步說明。
- **支援手動即時擷取與單集預覽**：
  - 修復點擊「預覽抓取」與「立即擷取」時拋出 `preview is not available for external sources` 的錯誤。
  - 後端 [`packages/backend/src/admin/sources.ts`](packages/backend/src/admin/sources.ts) 自動識別 Podcast 來源代碼，從資料庫最新抓取的單集中提取真實資料進行預覽與手動重新觸發同步，方便即時維護與診斷。

---

## [2026-10-14] — 🎙️ 全球 Podcast 智庫頻道、即時美股/台股行情聯動、雙向打通與 12pt Zen Kaku 字型升級

### 🎙️ 全球頂級 Podcast 智庫與 100+ 頻道目錄 (Podcast Intelligence & Directory)
- **100+ 頂尖 Podcast 頻道收錄與動態同步**：
  - 新增 [`industry/podcasts.json`](industry/podcasts.json) 目錄與資料庫 Migration (`0040_podcasts.sql`、`0041_podcast_audio_url_nullable.sql`)，收錄全球 100+ 頂級 AI、科技創業、半導體與財經 Podcast 頻道。
  - 定時同步 RSS Feed 節目元數據、發布時間、節目音訊/影音直連網址與 BigGo 真實主題實體標籤。
- **零磁碟 HTML5 音訊串流播放器 (Zero-Disk Audio Streaming)**：
  - 嚴格落實「零磁碟政策」：所有音訊以 HTML5 `<audio>` 直連第三方 CDN/伺服器串流播放，完全不下載、不佔用本機伺服器磁碟與頻寬。
  - 底部浮動播放列支援播放/暫停、15 秒快進/倒退、進度拖曳與真實時長計算。
  - 支援「訂閱/關注頻道」與「收藏單集」，採用 Local-First (`useSyncExternalStore`) 離線本機儲存，無須登入即可跨頁面記憶。

### 📈 Yahoo Finance 即時上市公司行情聯動 (Live Market Quotes — 100% Real Data)
- **杜絕假資料與 0.00% 佔位**：
  - 徹底清除任何靜態假數據，全面串接 Yahoo Finance 即時 API ([`packages/backend/src/providers/market.ts`](packages/backend/src/providers/market.ts))。
  - 自動於 PostgreSQL `market_quotes` 快取 118+ 檔美股/台股標的即時數據（如 NVDA、TSMC 2330.TW、UMC、META、AMZN、MSFT、GOOGL、GS、JPM 等），畫面精準渲染漲跌百分比與即時股價。
  - 具備未命中快取時的非同步自動補全與後台容錯機制。

### 🔄 雙向打通：Podcast 全面匯流進主站內容生態 (Bi-directional Feed Federation)
- **資料庫層級自動同步與打分橋接**：
  - 實作 [`packages/backend/src/publication/podcast-bridge.ts`](packages/backend/src/publication/podcast-bridge.ts)，將 Podcast 頻道登記為新聞來源（`sources`，kind: `external`），並將精選節目無縫映射入 `articles`、`analyses` 及 `publications`。
  - 支援 CLEF / JEV 決策標註與規則評分（精選評分 85 分，分類為 `opinion` 專家觀點）。
- **全站動態與標籤整合**：
  - 「全部 AI 動態」(`/all`) 與「精選」(`/`) 同步收錄 Podcast 單集，卡片標記 `🎙️ Podcast` 專屬音訊徽章。
  - 詳情頁（[`/items/pod_*`](apps/web/app/routes/item.tsx)）內嵌「Podcast 專家音訊節目」導流卡片，支援點擊一鍵返回 Podcast 推薦智庫。
  - 支援 `#Podcast` 專屬話題聚合頁面，方便讀者快速檢索音訊新聞。

### 🎨 視覺與排版標準升級 (Typography & Accessibility)
- **Google Fonts 雙字型整合**：全站引入 `Zen Kaku Gothic New:wght@500`（正文字體）與 `JetBrains Mono:wght@500`（等寬代碼與數字字體）。
- **嚴格執行 12pt（16px）中文字級標準**：全站根節點 `body` 預設字號提升至 16px（行高 1.6）；標題提升至 17~18px、正文與摘要 16px、標籤 14~15px，徹底消除小字號中文字不易閱讀的問題。

---

## 2026-10-09 — CLEF 全文预筛与原生评级

- CLEF 使用四级 `Score`（连续 0–3 加权评级），同时重视重大 AI 新闻与有具体依据的实用工具、方法、隐私与成本收益；普通非 AI 科技消息不因“科技”自动通过。
- 移除正文前 300 字限制，完整正文与 X 引用分批读取；长文以 AI 相关性挑选原文证据后重新判断整篇，不取片段最高分，不让页面导航或广告代替正文。
- 预筛门槛直接比较原生评级，修复 1.038 被显示分数四舍五入为 35 后错误过门槛的问题。保留默认门槛对应的 1.05，不采用未经人工校准的 1.5。
- 保留现有二次评分模型、单次评分设置、信源门槛与回执/预算/故障回退机制；未引入 oss-120b。
- 部署前试算使用 24 条真实历史材料：全文版本逐批 54 次、整篇证据 24 次 CLEF 调用。样本非随机、无人工 gold 标签，结果用于检查行为，不代表准确率或已校准的选稿门槛；历史文章不自动重算。

## [2026-10-08]

### ⚡️ Clef-Flash 主備雙端點自建高可用與 4K ubatch 極速單呼 (Dual-Endpoint HA & Fast Path)

- **自建 Clef 主備雙機高可用體系 (Primary + Fallback Dual-Node HA)**：
  - **主力端點 (`CLEF_BASE_URL`)**：指向 `https://clef.create360.ai/v1/systemone`（RTX A4000 GPU 節點，已解鎖 `--ubatch-size 4096`，單次 5 題 23 選項推論僅 ~570ms）。
  - **備援端點 (`CLEF_FALLBACK_BASE_URL`)**：指向 `https://clef.aiurl.tw/v1/systemone`，當主力節點遇連線異常或 5xx 故障時，系統自動秒級轉移至備援節點。
  - **四層級聯容災**：`Clef 主力 (GPU)` $\rightarrow$ `Clef 備援 (CPU)` $\rightarrow$ `Jev 雲端` $\rightarrow$ `主 LLM (Groq/Gemini/OpenAI)`。
- **快慢自適應推論管線**：
  - 預設直接單次並行發送所有問題（極速路徑，~0.5s 完成）。
  - 遇到受限批次節點（如 512 token 上限）時，自動透明降級為每批 $\le 10$ 選項之安全分塊調用，兼具極限速度與 100% 穩定度。
- **端點 URL 智慧自動正規化**：
  - 匯入 `normalizeClefEndpoint`，無論使用者在 `.env` 填入帶有 `/systemone`、`/v1` 或純網域名稱，均自動標準化至規格相容端點。

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
