// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 */
export const CATEGORIES = [
  { key: "ai-models", label: "模型", section: "模型發布/更新", guide: "新模型、模型版本、權重開放、模型能力與價格變化的發布與評測結果" },
  { key: "ai-products", label: "產品", section: "產品發布/更新", guide: "AI 產品、功能、應用、工具、API 與平台的發布和更新" },
  { key: "industry", label: "產業", section: "產業動態", guide: "公司經營、融資併購、人事、合作、訴訟、監管與政策、市場與基礎設施" },
  { key: "paper", label: "論文", section: "論文研究", guide: "研究論文、技術報告、基準與資料集" },
  { key: "tip", label: "教學", section: "技巧與觀點", guide: "教學、實務經驗、使用技巧、提示詞與工具用法、深度技術解析" },
  { key: "opinion", label: "觀點", section: "技巧與觀點", guide: "人物觀點、評論、分析、訪談、現象與趨勢討論" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 標籤詞表（台灣正體中文） ────────────────────────────────────────────────────────────

/** 每篇資料的第一個標籤必須是這些「分類標籤」之一。 */
export const CATEGORY_TAGS = [
  "產品更新", "模型發布", "論文/研究", "開源專案", "教學/實務", "現象/趨勢", "專家觀點", "評測/基準", "安全/對齊", "產業動態", "政策/法規",
  "非AI/通用工具", "其他",
] as const;

/** 可選的主題標籤（台灣正體科技術語）。 */
export const TOPIC_TAGS = [
  "Agent", "程式開發", "推理", "多模態", "語音", "視訊/影片", "圖像生成", "RAG", "邊緣端/裝置端", "資料/訓練", "搜尋", "部署/工程", "開源生態", "具身智能/機器人", "MCP/工具調用",
] as const;

/** 可選的實體標籤（公司、機構、平台）。 */
export const ENTITY_TAGS = ["OpenAI", "Anthropic", "DeepSeek", "DeepMind", "Google", "Meta", "Microsoft", "xAI", "Hugging Face", "GitHub", "arXiv"] as const;

/** 模型常寫的近義詞與簡中/俗語，統一對映成台灣正體詞表。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  // 教學 / 實務
  "教程/玩法": "教學/實務", "技巧/最佳实践": "教學/實務", "教程/实践": "教學/實務", "教學/實踐": "教學/實務", "教程": "教學/實務", "教学": "教學/實務", "教學": "教學/實務", "玩法": "教學/實務", "指南": "教學/實務", "技巧": "教學/實務", "最佳实践": "教學/實務", "實作": "教學/實務", "实践": "教學/實務", "實踐": "教學/實務",
  // 產業動態
  "合作/生态": "產業動態", "融资/收购": "產業動態", "公司动态": "產業動態", "行业动态": "產業動態", "行業動態": "產業動態", "行业": "產業動態", "行業": "產業動態", "产业": "產業動態", "產業": "產業動態", "动态": "產業動態", "動態": "產業動態", "合作": "產業動態", "生态": "產業動態", "生態": "產業動態", "融资": "產業動態", "融資": "產業動態", "收购": "產業動態", "收購": "產業動態", "投资": "產業動態", "投資": "產業動態", "并购": "產業動態", "併購": "產業動態",
  // 政策 / 法規
  "政策/监管": "政策/法規", "政策/監管": "政策/法規", "政策": "政策/法規", "监管": "政策/法規", "監管": "政策/法規", "法规": "政策/法規", "法規": "政策/法規",
  // 安全 / 對齊
  "安全/对齐": "安全/對齊", "安全": "安全/對齊", "对齐": "安全/對齊", "對齊": "安全/對齊",
  // 論文 / 研究
  "论文/研究": "論文/研究", "论文": "論文/研究", "論文": "論文/研究", "研究": "論文/研究", "paper": "論文/研究", "papers": "論文/研究",
  // 開源專案
  "开源/仓库": "開源專案", "開源/倉庫": "開源專案", "開源/專案": "開源專案", "open-source": "開源專案", "开源": "開源專案", "開源": "開源專案", "仓库": "開源專案", "倉庫": "開源專案", "repo": "開源專案",
  // 產品與模型
  "产品更新": "產品更新", "产品": "產品更新", "產品": "產品更新", "更新": "產品更新", "模型发布": "模型發布", "发布": "模型發布", "發布": "模型發布", "模型": "模型發布",
  // 現象與趨勢
  "现象/趋势": "現象/趨勢", "趋势": "現象/趨勢", "趨勢": "現象/趨勢", "现象": "現象/趨勢", "現象": "現象/趨勢",
  // 專家觀點（去「大佬」中國俚語）
  "大佬观点": "專家觀點", "大佬觀點": "專家觀點", "大老觀點": "專家觀點", "大佬": "專家觀點", "大老": "專家觀點", "观点": "專家觀點", "觀點": "專家觀點", "领袖观点": "專家觀點", "領袖觀點": "專家觀點",
  // 程式開發（去「編碼」中國用語）
  "编码": "程式開發", "編碼": "程式開發", "coding": "程式開發", "代码": "程式開發", "程式碼": "程式開發", "写代码": "程式開發", "寫程式": "程式開發",
  // 邊緣端 / 裝置端（去「端側」中國用語）
  "端侧": "邊緣端/裝置端", "端側": "邊緣端/裝置端", "on-device": "邊緣端/裝置端", "边缘端": "邊緣端/裝置端", "邊緣端": "邊緣端/裝置端", "设备端": "邊緣端/裝置端", "裝置端": "邊緣端/裝置端",
  // 資料 / 訓練（去「數據」中國用語）
  "数据/训练": "資料/訓練", "數據/訓練": "資料/訓練", "数据": "資料/訓練", "數據": "資料/訓練", "资料": "資料/訓練", "資料": "資料/訓練", "训练": "資料/訓練", "訓練": "資料/訓練",
  // 搜尋
  "搜索": "搜尋", "search": "搜尋",
  // 視訊 / 影片
  "视频": "視訊/影片", "視頻": "視訊/影片", "影片": "視訊/影片", "视频生成": "視訊/影片", "影片生成": "視訊/影片",
  // 具身智能 / 機器人
  "具身智能": "具身智能/機器人", "机器人": "具身智能/機器人", "機器人": "具身智能/機器人", "embodied": "具身智能/機器人",
  // 評測與基準
  "评测/基准": "評測/基準", "評測": "評測/基準", "基准": "評測/基準", "基準": "評測/基準", "benchmark": "評測/基準",
  // 通用工具與媒體
  "非ai": "非AI/通用工具", "non-ai": "非AI/通用工具", "通用工具": "非AI/通用工具", "工程工具": "非AI/通用工具",
  "安全扫描": "非AI/通用工具", "devops": "非AI/通用工具",
  "媒体": "媒體", "个人": "個人", "周刊": "週刊",
};

/** 模型漏了分類標籤時，按內容類型補一個。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  model_release: "模型發布",
  product_launch: "產品更新",
  tool_or_prompt: "教學/實務",
  research_paper: "論文/研究",
  industry_event: "產業動態",
  opinion_analysis: "專家觀點",
  tutorial_explainer: "教學/實務",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/** 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "阿里"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
