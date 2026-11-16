
【科技領域翻譯規則 — AI 與一般科技內容皆適用，嚴格遵守】

1. 歧義處理：依當前材料的技術語境翻譯，不把一般科技術語強制解讀為 AI 詞彙：
   - LLM = 大型語言模型（絕不譯「法學碩士」/「Master of Laws」）
   - Token / tokens = 模型語境為 token、認證語境可譯為權杖或憑證；依上下文判斷
   - Transformer = 模型架構保留 Transformer，電力設備依語境譯為變壓器
   - Diffusion = 依語境譯為擴散模型或擴散
   - Agent / Agentic = 一律譯為 AI 助理（不要用「智慧體」「智能體」「代理程式」這種生硬直譯詞）
   - Alignment = AI 模型語境譯為對齊
   - Inference = 模型語境譯為推論或推理，其他領域依上下文
   - Reasoning = AI 模型語境譯為推理；必要時用「鏈式推理」區分 CoT
   - Embedding = 嵌入向量（也可保留英文）
   - Distillation = 知識蒸餾
   - Hallucination = 模型幻覺
   - Fine-tune / Fine-tuning = 微調
   - Pretrain / Pretraining = 預訓練
   - Context window = 上下文視窗
   - Prompt = 提示詞
   - Skill / Skills = 技能（Claude 等 Agent 框架的能力包，不譯「特長」）

2. 以下專有名詞**一律保留英文原文**，不翻譯不加中文括註：
   - 科技公司與專案名稱依原文保留，例如 OpenAI / Anthropic / Google DeepMind / xAI / Meta / Mistral / DeepSeek / Linux / PostgreSQL / Rust / Kubernetes / Hugging Face
   - 模型族（舉例 + 通用規則）：GPT / Claude / Gemini / Llama / Qwen / Grok / o 系列 / DeepSeek / Mistral / Mixtral / Phi / Sora / Veo / Imagen
     **規則**：任何大型模型族名、產品代號一律保留英文
   - 模型版本號（舉例 + 通用規則）：GPT-5 / Claude 4.7 / Claude Sonnet 4.6 / Llama 4 / Gemini 3 / o3 / o4 / DeepSeek-V4 / Qwen3.7
     **規則**：版本號一字不改（包括字母數字後綴如 4o / 4.7 / 405B / V4 / R1），絕不「翻譯性擴寫」（不要把 "405B" 譯成「4050 億」，不要把 "V4" 譯成「第 4 代」）
   - 技術縮寫（舉例 + 通用規則）：LLM / RAG / RLHF / DPO / LoRA / QLoRA / PEFT / MoE / CoT / ReAct / KV cache / SOTA / AGI / MCP / ADK / NPU / GPU / TPU
     **規則**：保留原文中的技術縮寫，不自行套用 AI/ML 含義；依上下文保留 CVE、RCE、PoC、CPU、API 等縮寫
   - 評測基準（舉例 + 通用規則）：MMLU / GPQA / HumanEval / SWE-bench / SWE-bench Verified / AIME / HLE / ARC-AGI / ARC-AGI 2 / MT-Bench / Chatbot Arena / Aider Polyglot / LiveCodeBench
     **規則**：以 -bench / -eval 結尾或全大寫的評測名一律保留英文
   - AI 工具／產品：Cursor / Copilot / Codex / Aider / Devin / Cline / Claude Code / Windsurf / Zed / v0 / Bolt / Lovable / Replit Agent
   - Agent 框架：LangChain / LangGraph / LlamaIndex / CrewAI / AutoGen / Pydantic AI / Vercel AI SDK / DSPy
   - 推論／部署：Ollama / vLLM / SGLang / TensorRT / Triton / CUDA / ROCm
   - 通用技術：API / SDK / CLI / IDE / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 中國廠商**優先使用官方中文品牌名**（首次出現可雙標「千問（Qwen3）」，後續選一種保持一致）：
   - 千問（Qwen）／文心一言／智譜（GLM）／月之暗面（Kimi）／深度求索（DeepSeek）／階躍星辰（Step）／零一萬物（Yi）／百川／豆包（字節跳動）／混元（騰訊）／可靈（Kling，快手）／即夢（Jimeng，字節跳動）／MiniMax（不譯）／美團 LongCat／崑崙萬維 Skywork／面壁 MiniCPM／華為昇騰／寒武紀

4. 程式碼／指令／URL／數字單位 **一字不改**保留：
   - 反引號程式碼 `code` 不翻譯
   - 指令如 `/code-review`、`pip install`、`npm run` 不譯
   - URL 原樣保留
   - 數字＋單位：8k context / 175B params / 3.5x speedup / $3 per M tokens / 99.9%
   - 金額、參數量、比例、區間必須保留原文的阿拉伯數字與單位；不要把 $10B-$100B 改寫成「數百億至數千億美元」等模糊中文數量詞

5. {{> rules-taiwan-zh}}
