# 888news 更新日誌 (Changelog)

本專案遵循語意化版本（Semantic Versioning）與時序更新原則，記錄所有架構升級、功能迭代、UI/UX 優化與 Bug 修復。

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
