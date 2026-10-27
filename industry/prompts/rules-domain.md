
【科技領域翻譯規則 — AI 與一般科技內容皆適用，嚴格遵守】

1. 歧義處理：依當前材料的技術語境翻譯，不把一般科技術語強制解讀為 AI 詞彙：
   - LLM = 大语言模型（绝不译"法学硕士"/"Master of Laws"）
   - Token / tokens = 模型語境為 token、認證語境可譯為權杖或憑證；依上下文判斷
   - Transformer = 模型架構保留 Transformer，電力設備依語境譯為變壓器
   - Diffusion = 依語境譯為擴散模型或擴散
   - Agent / Agentic = 依語境譯為 AI 智慧體、代理程式或代理架構
   - Alignment = AI 模型語境譯為對齊
   - Inference = 模型語境譯為推論或推理，其他領域依上下文
   - Reasoning = AI 模型語境譯為推理；必要時用「鏈式推理」區分 CoT
   - Embedding = 嵌入向量（也可保留英文）
   - Distillation = 知识蒸馏
   - Hallucination = 模型幻觉
   - Fine-tune / Fine-tuning = 微调
   - Pretrain / Pretraining = 预训练
   - Context window = 上下文窗口
   - Prompt = 提示词
   - Skill / Skills = 技能（Claude 等 Agent 框架的能力包，不译"特长"）

2. 以下专有名词**一律保留英文原文**，不翻译不加中文括注：
   - 科技公司與專案名稱依原文保留，例如 OpenAI / Anthropic / Google DeepMind / xAI / Meta / Mistral / DeepSeek / Linux / PostgreSQL / Rust / Kubernetes / Hugging Face
   - 模型族（举例 + 通用规则）：GPT / Claude / Gemini / Llama / Qwen / Grok / o 系列 / DeepSeek / Mistral / Mixtral / Phi / Sora / Veo / Imagen
     **规则**：任何大模型族名、产品代号一律保留英文
   - 模型版本号（举例 + 通用规则）：GPT-5 / Claude 4.7 / Claude Sonnet 4.6 / Llama 4 / Gemini 3 / o3 / o4 / DeepSeek-V4 / Qwen3.7
     **规则**：版本号一字不改（包括字母数字后缀如 4o / 4.7 / 405B / V4 / R1），绝不"翻译性扩写"（不要把 "405B" 译成 "4050 亿"，不要把 "V4" 译成 "第 4 代"）
   - 技术缩写（举例 + 通用规则）：LLM / RAG / RLHF / DPO / LoRA / QLoRA / PEFT / MoE / CoT / ReAct / KV cache / SOTA / AGI / MCP / ADK / NPU / GPU / TPU
     **規則**：保留原文中的技術縮寫，不自行套用 AI/ML 含義；依上下文保留 CVE、RCE、PoC、CPU、API 等縮寫
   - 评测基准（举例 + 通用规则）：MMLU / GPQA / HumanEval / SWE-bench / SWE-bench Verified / AIME / HLE / ARC-AGI / ARC-AGI 2 / MT-Bench / Chatbot Arena / Aider Polyglot / LiveCodeBench
     **规则**：以 -bench / -eval 结尾或全大写的评测名一律保留英文
   - AI 工具/产品：Cursor / Copilot / Codex / Aider / Devin / Cline / Claude Code / Windsurf / Zed / v0 / Bolt / Lovable / Replit Agent
   - Agent 框架：LangChain / LangGraph / LlamaIndex / CrewAI / AutoGen / Pydantic AI / Vercel AI SDK / DSPy
   - 推理/部署：Ollama / vLLM / SGLang / TensorRT / Triton / CUDA / ROCm
   - 通用技术：API / SDK / CLI / IDE / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 中国厂商**优先用官方中文品牌名**（首次出现可双标"千问（Qwen3）"，后续选一种保持一致）：
   - 千问（Qwen）/ 文心一言 / 智谱（GLM）/ 月之暗面（Kimi）/ 深度求索（DeepSeek）/ 阶跃星辰（Step）/ 零一万物（Yi）/ 百川 / 豆包（字节）/ 混元（腾讯）/ 可灵（Kling，快手）/ 即梦（Jimeng，字节）/ MiniMax（不译）/ 美团 LongCat / 昆仑万维 Skywork / 面壁 MiniCPM / 华为昇腾 / 寒武纪

4. 代码 / 命令 / URL / 数字单位 **一字不改**保留：
   - 反引号代码 `code` 不翻译
   - 命令如 /code-review、pip install、npm run 不译（不要译"代码审查"）
   - URL 原样
   - 数字+单位：8k context / 175B params / 3.5x speedup / $3 per M tokens / 99.9%
   - 金额、参数量、比例、区间必须保留原文的阿拉伯数字和单位；不要把 $10B-$100B 改写成“数百亿至数千亿美元”等中文数量词

5. 繁體中文（台灣習慣用語）嚴格規範：
   - 所有標題、摘要、理由與正文翻譯**一律使用台灣繁體中文（正體中文）**輸出，絕不輸出簡體字。
   - 遵循台灣科技用語習慣：
     - 信息 → 資訊
     - 网络 → 網路
     - 内存 → 記憶體
     - 算法 → 演算法
     - 程序员 / 开发者 → 工程師 / 開發者
     - 软件 / 硬件 → 軟體 / 硬體
     - 默认 → 預設
     - 项目 → 專案
     - 博客 → 部落格
     - 视频 → 影片
     - 支持 → 支援
     - 刷新记录 → 刷新紀錄

