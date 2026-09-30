# 888news

<p align="center">
  <b>全球科技與 AI 情報雷達 · 每日精選 · 多語系熱點聚合與自動簡報</b><br>
  Global AI & Tech Intelligence Radar with Multi-Language Support
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
  <a href="https://github.com/tbdavid2019/888news"><img src="https://img.shields.io/badge/GitHub-tbdavid2019%2F888news-202a30?style=flat-square&logo=github" alt="GitHub Repository"></a>
</p>

<p align="center">
  <a href="#致謝原作者">致謝原作者</a> ·
  <a href="#核心特色">核心特色</a> ·
  <a href="#快速上手">快速上手</a> ·
  <a href="#架構與工作原理">工作原理</a> ·
  <a href="#環境變數配置">配置參數</a> ·
  <a href="#授權協議">授權協議</a>
</p>

<br>

---

## 致謝原作者 (Special Thanks)

**888news** 的核心架構與情報處理引擎深深受益於 **數字生命卡茲克** 所開創的 [AIHOT](https://github.com/KKKKhazix/AIHOT) 開源專案。

在此由衷感謝原作者無私開源這套兼具設計美感與高工程品質的行業熱點框架，將自動化信源採集、多模型評分、事件向量聚類與日報生成的「火種」交到社群手中。

遵照開源規範與原作者聲明：
- 本專案採用全新的獨立識別 **888news**。
- 本專案基於原版架構進行了現代化多語系國際化擴展（繁體中文/台灣用語在地化、English 國際化、智慧語系偵測）、開放參數化設定與客製化升級。

---

## 這是什麼

**888news** 是一個能夠**自動盯住全球信源、用大模型篩選寫作、歸併多方報導為單一事件，並每日自動產出情報簡報**的現代化資訊雷達。

每天科技圈有成千上萬條資訊發布，但其中 90% 都是同質公關稿、轉述水文與瑣碎雜訊。888news 透過完整的流水線處理：
1. **盯住海量信源**：官方部落格、科技媒體、X / Twitter、GitHub Releases、研究機構等。
2. **兩次獨立模型評分**：先預篩剔除雜訊，再由獨立大模型評分，只有跨越門檻的高價值情報才能入選。
3. **事件聚類與熱度榜**：運用向量相似度與模型二次驗證，將多篇報導同一事件的內容歸組為單一事件，計算獨立討論源，真實反映熱點排行。
4. **全平台交付**：提供網頁、深淺色切換、RSS 訂閱、RESTful OpenAPI、MCP (Model Context Protocol) 以及 `llms.txt`。

---

## 核心特色

### 🌐 1. 全方位多語系支援 (Multi-Language)
- **繁 | EN | 简 平滑切換**：提供繁體中文（`zh-TW`）、英文（`en`）、簡體中文（`zh-CN`）完整介面字典支援。
- **瀏覽器語系自動偵測**：首次造訪依使用者環境自動適配，非中文環境預設自動 Fallback 顯示英文。
- **動態內文繁體在地化（台灣詞彙）**：整合伺服端 OpenCC（`cn` $\rightarrow$ `twp` 詞庫），自動將新聞內文的標題、摘要、推薦理由轉化為在地化用語（如「網絡」$\rightarrow$「網路」、「内存」$\rightarrow$「記憶體」），且完全在 Node.js SSR 處理，零前端資源負擔。

### 🤖 2. 智慧情報管線
- **六種信源相容**：支援 RSS / Atom、網頁列表 (Web List)、JSON API、X (Twitter)、微信公眾號及外部腳本推播。
- **動態調整頻率**：一手信源與活躍源高頻巡邏，產出低的信源自動降低頻率。
- **大模型寫作**：自動提煉「答案先行」的高密度中文摘要、核心觀點與入選推薦理由。

### 🔥 3. 事件歸組與真實熱點演算法
- **同一件事只看一次**：不論多少家媒體轉載、社群如何討論，同一事件彙整為一個主卡片，後續發展串聯在事件時間軸上。
- **防灌水熱度評分**：單一媒體發十篇僅計一次權重，結合 48 小時時間衰減演算法，精準呈現真正引起全網關注的重要趨勢。

### 🛡️ 4. 全球頂級 LLM 支援、多級熔斷防驚群 Fallback
- **廣泛服務商相容**：原生預設整合 Groq（Llama 3.3 70B, DeepSeek R1）、Google Gemini（2.5 Flash, 2.5 Pro）、OpenAI（GPT-4o, GPT-4o-mini）以及任何相容 OpenAI 的 API 端點。
- **三級容災架構 (`Primary` $\rightarrow$ `Fallback 1` $\rightarrow$ `Fallback 2`)**：遇到 Rate Limit (HTTP 429) 或 5xx 故障時自動無縫降級，保障 24/7 流水線不停擺。
- **熔斷器 (Circuit Breaker) & 防驚群效應 (Anti-Thundering Herd)**：
  - 故障連續觸發時進入 `OPEN` 熔斷狀態，冷卻期內立即短路，拒絕盲目重試。
  - 冷卻後採用單一探針（Canary Probe）進行 `HALF-OPEN` 恢復探測。
  - 降級請求具備**隨機抖動退避（Randomized Jitter Backoff）**與**併發限制信號量（Concurrency Semaphore）**，徹底消除峰值流量瞬間壓垮備用 LLM 的驚群效應。
- **降級即時告警**：每次觸發 Fallback 降級均會自動發送警報至管理員頻道。

### 📡 5. 多渠道 Webhook 通知 (Slack / Discord / Telegram)
- 揮別單一通訊軟體限制，全方位支援 **Slack**、**Discord**、**Telegram** 即時 Webhook 與 Bot 通知。
- 系統告警（如 LLM 降級觸發、採集靜默警報、每日情報摘要）與使用者提交之意見反饋（Feedback）均可即時、非同步並行廣播至指定頻道。

### 🕷️ 6. 動態反爬蟲 Universal Web Reader
- 整合 `2md.aiurl.tw` (888-url2md) 高效 Markdown 渲染器，輕鬆穿透 SPA 與動態反爬頁面。
- 具備雙層防護機制，若有設定 `JINA_API_KEY` 時亦可平滑自動容災切換。

### 🔌 7. 為 AI Agent 與開放生態而生
- **Model Context Protocol (MCP)**：內建 MCP Server，任何 AI Agent（如 Claude Desktop、Cursor、Cline）均可直接掛載為工具，呼叫最新情報與搜尋。
- **RSS 與 OpenAPI**：包含精選、全文、日報、主題分類多維度 RSS 與無須授權的唯讀 RESTful 介面。

---

## 快速上手

### 系統需求
- [Docker](https://docs.docker.com/get-docker/) 與 Docker Compose
- Node.js 24+（後端原生執行 TypeScript）
- 一組 OpenAI 相容的大模型 API Key（OpenAI, Groq, Gemini, DeepSeek, 千問等均可）

### 一鍵啟動

```bash
# 1. 複製專案庫
git clone https://github.com/tbdavid2019/888news.git
cd 888news

# 2. 初始化環境設定檔
node scripts/init-env.ts --llm-key <你的大模型 API KEY>

# 3. 啟動所有容器服務（Web、API、Worker、PostgreSQL、Caddy）
docker compose up -d --build
```

啟動後造訪：
- 前端站點：<http://localhost:3000>
- 管理後台：<http://localhost:3000/admin>（預設管理密碼請見 `.env` 的 `ADMIN_PASSWORD`）

---

## 環境變數配置

所有環境變數集中在 `.env`，主要常用參數如下：

| 變數名稱 | 說明 | 預設值 / 範例 |
|---|---|---|
| `SITE_URL` | 網站對外正式域名 | `http://localhost:3000` |
| `SITE_ICP` | 網站備案號（選填，若無備案保持為空即可） | `null` |
| `GITHUB_REPO_URL` | 開源專案 GitHub 倉庫連結 | `https://github.com/tbdavid2019/888news` |
| `ADMIN_PASSWORD` | 管理後台登入密碼 | 由 `init-env.ts` 隨機生成 |
| `DATABASE_URL` | PostgreSQL 連線字串 | `postgres://user:pass@127.0.0.1:5432/aihot` |
| **`LLM_API_KEY`** | 主要大模型 API 金鑰 | 自行填寫（OpenAI / Groq / Gemini 等） |
| **`LLM_BASE_URL`** | 主要大模型 API 端點 | `https://api.openai.com/v1` 等 |
| **`LLM_MODEL`** | 主要大模型名稱 | `gpt-4o-mini` / `deepseek-flash` 等 |
| **`LLM_FALLBACK_1_*`** | 第一級容災大模型配置（BaseURL, Key, Model） | 選填，故障時自動切換 |
| **`LLM_FALLBACK_2_*`** | 第二級容災大模型配置（BaseURL, Key, Model） | 選填，次級故障時切換 |
| **`READER_BASE_URL`** | 動態反爬網頁渲染器 | `https://2md.aiurl.tw` |
| **`SLACK_WEBHOOK_URL`** | Slack 告警與反饋通知 Webhook URL | 選填 |
| **`DISCORD_WEBHOOK_URL`** | Discord 告警與反饋通知 Webhook URL | 選填 |
| **`TELEGRAM_BOT_TOKEN`** | Telegram Bot API Token | 選填 |
| **`TELEGRAM_CHAT_ID`** | Telegram 頻道 / 群組 Chat ID | 選填 |

> 💡 **使用者反饋 (Feedback) 與告警通知**  
> 使用者提交的反饋直接儲存於 PostgreSQL `feedback` 表，並即時透過 Webhook 同步推播至已啟用的 Slack、Discord、Telegram 頻道；若啟用飛書亦支援推播至內部群組。絕不傳送至任何第三方未知信箱。

---

## 自定義與客製化

要自訂信源或替換產業主題，只需編輯 [`industry/`](industry/) 目錄：

```text
industry/
├── site.ts          # 站名、品牌標語、首頁文案、GitHub 與 ICP 參數
├── taxonomy.ts      # 分類標籤、主題維度定義
├── topics.json      # 專題追蹤主題
├── sources.json     # 初始信源清單
├── prompts/         # 篩選評分標準、摘要撰寫、事件聚類提示詞
├── selection.ts     # 入選門檻閥值
└── brand/           # Logo、圖示與視覺資產
```

---

## 技術棧

- **Runtime & Language**：Node.js 24（原生 ESM / TypeScript 執行，無編譯負擔）
- **Web 前端**：React Router (SSR) · Tailwind CSS
- **API 後端**：Fastify · OpenAPI
- **任務排程**：Worker Process · pg-boss 隊列
- **資料庫**：PostgreSQL 17
- **國際化**：自研 i18n 輕量架構 · OpenCC 繁簡轉換引擎
- **部署營運**：Docker Compose · Caddy 反向代理

---

## 授權協議

本專案基於 [MIT 授權條款](LICENSE) 開源。  
字體、部分展示商標與信源標誌各有其版權所屬，詳見 [NOTICE](NOTICE)。
