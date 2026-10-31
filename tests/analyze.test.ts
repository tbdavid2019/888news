// The judging and writing steps (editorial/analyze.ts): the prefilter decides relevance, two scores
// against the tier threshold decide 精选, selected and near-selected items are written by the content
// understanding and the rest by the title/summary prompts, a structure step gives the category, subjects
// and fact. Material with only a feed summary has its page fetched first. The steps run on the models
// AIHOT assigns them (set through the environment here); every prompt in the pack renders.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { ANALYZE_PROMPT_VERSION, analyzeArticle, PROMPT_VERSIONS, SCORE_SYSTEM, tierThreshold } from "@aihot/backend/editorial/analyze";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { compactAnswerFirstSummary, enforceIdentity, parseTranslateOutput, PREFILTER_SYSTEM } from "@aihot/backend/editorial/writing";
import { promptText } from "@aihot/backend/editorial/prompts";
import { SITE } from "@aihot/industry/site";
import { normalizeTags } from "@aihot/backend/editorial/vocabulary";
import { resetClefState } from "../packages/backend/src/providers/jev.ts";

const T = tag();
const SOURCE = `test-analyze-${T}`;
const X_SOURCE = `test-analyze-x-${T}`;

type Step = "prefilter" | "score" | "understand" | "summarize" | "structure";
interface Req { step: Step; marker: string; system: string; user: string; body: Record<string, any> }
const requests: Req[] = [];
const MARKERS = ["CLEAR", "RESCUE", "LOW", "OFFTOPIC", "BARE", "VAGUE", "THIN", "SENSITIVE", "INFOSEC", "INFOSLOW", "CLEFSEC", "SECGUIDE", "推文"];
const scoreAnswers: Record<string, number[]> = { CLEAR: [78, 72], RESCUE: [56, 50], LOW: [45, 40], THIN: [70, 70], SENSITIVE: [80, 80], INFOSEC: [84, 78], INFOSLOW: [30, 32], CLEFSEC: [84, 78], SECGUIDE: [30, 32], 推文: [40, 40], BARE: [30, 34], VAGUE: [60, 62] };

const stepOf = (system: string, user: string): Step =>
  system === PREFILTER_SYSTEM ? "prefilter" : system.includes("事件注意力评分器") ? "score"
  : system.includes("内容理解编辑") ? "understand" : system.includes("結構化助手") ? "structure"
  : user.includes("title_zh") ? "summarize" : (() => { throw new Error("unknown request"); })();

// One stub stands in for DashScope (prefilter, structure), Zhipu (score, understand) and DeepSeek (summarize).
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> } & Record<string, any>;
  const system = body.messages[0]!.role === "system" ? String(body.messages[0]!.content) : "";
  const last = body.messages[body.messages.length - 1]!.content;
  const user = typeof last === "string" ? last : JSON.stringify(last);
  const step = stepOf(system, user);
  const marker = [...MARKERS].sort((a, b) => b.length - a.length).find((m) => user.includes(m)) ?? "";
  requests.push({ step, marker, system, user, body });
  const answer = (content: unknown) => ({ id: `stub-${requests.length}`, model: "stub", choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  if (step === "prefilter") return answer({ label: marker === "OFFTOPIC" || marker === "BARE" ? "BLOCK" : marker === "VAGUE" ? "UNKNOWN" : "PASS", reason: "测试" });
  if (step === "score") return answer({ attentionScore: scoreAnswers[marker]!.shift() });
  if (step === "understand") {
    if (marker === "SENSITIVE") return new Reply(400, { contentFilter: [{ level: 1, role: "user" }], error: { code: "1301", message: "系统检测到输入或生成内容可能包含不安全或敏感内容" } });
    if (marker === "INFOSEC" || marker === "CLEFSEC") return answer({ itemType: "industry_event", authorRole: "observer", tags: ["產業動態", "資訊安全"], editorialJudgment: "OpenSSH 的受影響版本與修補資訊可協助管理者判斷升級時程。", titleZh: "OpenSSH 修補未驗證遠端程式碼執行漏洞", summaryZh: "OpenSSH 9.8 至 9.9 存在未驗證 RCE；研究者公開 PoC，專案釋出 9.9.1 修補版並提供設定緩解。" });
    return answer({ itemType: "model_release", authorRole: "principal", tags: ["模型发布", "开源", "Agent", "不存在的标签"], editorialJudgment: `理由 ${marker}`, titleZh: `理解标题 ${marker}`, summaryZh: `理解摘要 ${marker}。第二句补充一个关键数字。` });
  }
  if (step === "structure") return answer(marker === "INFOSEC" || marker === "INFOSLOW" || marker === "CLEFSEC" || marker === "SECGUIDE"
    ? { category: marker === "SECGUIDE" ? "tip" : "industry", tags: marker === "INFOSLOW" || marker === "SECGUIDE" ? ["資訊安全"] : ["產業動態", "資訊安全"], subjects: [], fact: { title: "OpenSSH 修補 RCE", subject: "OpenSSH", action: "修補", object: "RCE 漏洞", occurredAt: null } }
    : { category: "ai-models", tags: ["模型发布", "推理"], subjects: ["anthropic", "unknown-co"], fact: { title: `事实 ${marker}`, subject: "某公司", action: "发布", object: "模型", occurredAt: null } });
  return answer(`title_zh: 翻译标题 ${marker}\nsummary_zh: 翻译摘要 ${marker}。第二句补充影响。`);
});
for (const env of ["DASHSCOPE_BASE_URL", "ZHIPU_BASE_URL", "DEEPSEEK_BASE_URL"]) process.env[env] = `${provider.url}/v1`;
for (const env of ["DASHSCOPE_API_KEY", "ZHIPU_API_KEY", "DEEPSEEK_API_KEY"]) process.env[env] = "test-key";
// AIHOT's own assignment of models to steps (the open-source default is one model for all of them).
Object.assign(process.env, { PREFILTER_MODEL: "qwen3.7-flash", SCORE_MODEL: "glm-5.3-flash-selection", UNDERSTAND_MODEL: "glm-5.3-flash", SUMMARIZE_MODEL: "deepseek-flash", STRUCTURE_MODEL: "qwen3.8-flash" });

const clefRequests: Record<string, any>[] = [];
const clefProvider = await stub((_hit, req) => {
  const input = JSON.parse(req.body);
  clefRequests.push(input);
  return {
    model: "clef-flash", answers: {
      relevance: { type: "choice", choice: "PASS", confidence: 0.96, probabilities: { PASS: 0.96, BLOCK: 0.02, UNKNOWN: 0.02 } },
      score: { type: "score", score: 3, confidence: 0.95 },
      category: { type: "choice", choice: "industry", confidence: 0.95 },
      itemType: { type: "choice", choice: "industry_event", confidence: 0.95 },
      authorRole: { type: "choice", choice: "observer", confidence: 0.95 },
    }, usage: { input_tokens: 100, output_tokens: 0 },
  };
});

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
    (${SOURCE}, 'Test analyze source', 'rss', 'T1', 'editorial', '2100-01-01'),
    (${X_SOURCE}, 'Test X account', 'x_search', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await clefProvider.close();
  await stopBoss();
  await closeDb();
});

// The tag keeps each material unique: identical input would reuse an earlier run's paid answers.
const LONG = "a lab released a model with a benchmark table and pricing details. ".repeat(8);
const article = async (marker: string, extra: Record<string, unknown> = {}) =>
  (await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${marker}-${T}`, title: `${marker} model release ${T}`, bodyText: `${marker}: ${LONG} (${T})`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date("2026-09-28T01:02:03Z"), ...extra,
  } as never)).articleId;
const calls = (marker: string) => requests.filter((r) => r.marker === marker).map((r) => r.step);
const row = async (id: string) =>
  (await sql<{ selected: boolean; relevance: string; score: string | null; title_zh: string; reason_zh: string | null; category: string | null; tags: string[]; subjects: string[]; receipt_ids: string[]; output: Record<string, any> }[]>`
    SELECT selected, relevance, score, title_zh, reason_zh, category, tags, subjects, receipt_ids, output FROM analyses WHERE article_id = ${id} ORDER BY id DESC LIMIT 1`)[0]!;

test("every prompt in the pack renders, and the site's name replaces AIHOT's", () => {
  const dir = new URL("../industry/prompts/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  // Every value any prompt asks for, so each renders on its own.
  const names = new Set(files.flatMap((f) => [...readFileSync(new URL(f, dir), "utf8").matchAll(/\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g)].map((m) => m[1]!)));
  const values = Object.fromEntries([...names].map((n) => [n, "x"]));
  for (const file of files) {
    const text = promptText(file.slice(0, -3), values);
    assert.ok(text.length > 20 && !/\{\{/.test(text), file);
  }
  assert.ok(PREFILTER_SYSTEM.startsWith(`为${SITE.name}做科技领域宽召回预筛`));
  assert.match(PREFILTER_SYSTEM, /重大 CVE\/0-day\/RCE/);
  for (const prompt of [
    promptText("story-digest", { siteName: SITE.name }),
    promptText("report-daily-lead", { siteName: SITE.name }),
    promptText("report-period", { siteName: SITE.name, kindName: "週報", overviewLength: "300" }),
  ]) {
    assert.match(prompt, /已確認遭利用、研究者驗證與推測/);
    assert.match(prompt, /AI 發現漏洞.*只按來源證據表述/);
  }
});

test("tag normalization separates infosec from explicit AI safety and preserves both", () => {
  assert.deepEqual(normalizeTags(["安全"]), ["其他"]);
  assert.deepEqual(normalizeTags(["產業動態", "安全"]), ["產業動態"]);
  assert.deepEqual(normalizeTags(["資訊安全"]), ["其他", "資訊安全"]);
  assert.deepEqual(normalizeTags(["安全/對齊"]), ["安全/對齊"]);
  assert.deepEqual(normalizeTags(["資訊安全", "安全/對齊"]), ["安全/對齊", "資訊安全"]);
});

test("a selected item: prefilter, two scores, the content understanding and the structure", async () => {
  assert.equal(tierThreshold("T1"), 72);
  const id = await article("CLEAR");
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, 75], "78 + 72 = 150 >= 120");
  assert.deepEqual(calls("CLEAR").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([r.title_zh, r.reason_zh, r.category, r.receipt_ids.length], ["理解标题 CLEAR", "理由 CLEAR", "ai-models", 5]);
  assert.deepEqual(r.tags, ["模型發布", "開源專案", "Agent", "Anthropic"], "vocabulary tags (synonyms mapped, unknown dropped) and the subject's tag");
  assert.deepEqual(r.subjects, ["anthropic"]);
  assert.deepEqual([r.output.writer, r.output.itemType, r.output.prefilter.label, r.output.fact.title], ["understand", "model_release", "PASS", "事实 CLEAR"]);
  const score = requests.find((q) => q.marker === "CLEAR" && q.step === "score")!;
  assert.match(score.user, /【标题】\nCLEAR model release/, "the score reads the original title, before any writing");
  assert.deepEqual([score.body.temperature, score.body.reasoning_effort, score.body.max_tokens], [1, "high", 65536]);
  const understand = requests.find((q) => q.marker === "CLEAR" && q.step === "understand")!;
  assert.ok(understand.user.startsWith("请按系统规则理解以下单篇材料，一次返回全部六个字段。"));
  assert.ok(understand.system.includes("【摘要答案前置规则") && understand.system.includes("【标题自洽规则"));
  const prefilter = requests.find((q) => q.marker === "CLEAR" && q.step === "prefilter")!;
  assert.ok(JSON.parse(prefilter.user).includes("【材料质量】"), "the material context, sent as a JSON string");
});

test("an evidence-based infosec item reaches both scores, summary and the distinct infosec tag", async () => {
  const id = await article("INFOSEC", {
    title: `OpenSSH CVE-2026-12345 allows unauthenticated RCE ${T}`,
    bodyText: `INFOSEC: OpenSSH 9.8 through 9.9 has a remotely exploitable RCE before authentication. Researchers published a proof of concept; the project released OpenSSH 9.9.1 and a configuration mitigation. ${T}`,
  });
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, 81]);
  assert.deepEqual(calls("INFOSEC").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([r.title_zh, r.category, r.tags], ["OpenSSH 修補未驗證遠端程式碼執行漏洞", "industry", ["產業動態", "資訊安全"]]);
  assert.equal(r.output.writer, "understand");

  const prefilter = requests.find((q) => q.marker === "INFOSEC" && q.step === "prefilter")!;
  assert.match(prefilter.system, /每个列出的科技领域都可独立收录，不要求与 AI 相关/);
  assert.match(prefilter.user, /CVE-2026-12345/);
  const score = requests.find((q) => q.marker === "INFOSEC" && q.step === "score")!;
  assert.match(score.system, /實際攻擊證據/);
  assert.match(score.system, /重大漏洞修补或已利用漏洞的紧急缓解依实际资安影响正常评分/);
  const understand = requests.find((q) => q.marker === "INFOSEC" && q.step === "understand")!;
  assert.match(understand.system, /受影響產品與版本/);
  assert.match(understand.system, /研究 PoC/);
  assert.match(understand.system, /「資訊安全」/);
  assert.match(understand.system, /「安全\/對齊」/);
  assert.equal(r.output.writerModel, "glm-5.3-flash");
  const [analysis] = await sql<{ prompt_version: string }[]>`SELECT prompt_version FROM analyses WHERE article_id = ${id} ORDER BY id DESC LIMIT 1`;
  assert.equal(analysis!.prompt_version, ANALYZE_PROMPT_VERSION);
  const [prefilterReceipt] = await sql<{ request: { promptVersion: string } }[]>`SELECT request FROM receipts WHERE id = ${res!.receiptIds[0]}`;
  assert.equal(prefilterReceipt!.request.promptVersion, PROMPT_VERSIONS.prefilter);

  const lowId = await article("INFOSLOW", {
    title: `OpenSSH routine documentation refresh ${T}`,
    bodyText: `INFOSLOW: OpenSSH refreshed a documentation page with no vulnerability, behavior or version changes. ${T}`,
  });
  const low = await analyzeArticle(lowId);
  assert.deepEqual([low!.output!.selected, low!.output!.score, (await row(lowId)).output.writer], [false, 31, "summarize"]);
  assert.deepEqual((await row(lowId)).tags, ["產業動態", "資訊安全"], "the explicit structure category supplies the missing category tag");
  const fallback = requests.find((q) => q.marker === "INFOSLOW" && q.step === "summarize")!;
  assert.match(fallback.user, /【資安摘要規則】/);
  assert.match(fallback.user, /已知攻擊／研究 PoC／理論推測/);
});

test("a pure infosec article passes CLEF and reaches scoring, summary and infosec tagging", async () => {
  config.allowPrivateNetworkFetch = true; // This case calls only the localhost CLEF stub.
  process.env.CLEF_ENABLED = "true";
  process.env.CLEF_BASE_URL = clefProvider.url;
  process.env.CLEF_FALLBACK_BASE_URL = "";
  resetClefState();
  try {
    const id = await article("CLEFSEC", {
      title: `OpenSSH CVE-2026-12345 permits unauthenticated remote code execution ${T}`,
      bodyText: `CLEFSEC: OpenSSH 9.8 through 9.9 permits unauthenticated remote code execution. Researchers published a proof of concept. The project released version 9.9.1 to fix the vulnerability. ${T}`,
    });
    const result = await analyzeArticle(id);
    const r = await row(id);
    assert.deepEqual([result!.output!.selected, result!.output!.relevance, r.output.prefilter.label, r.output.writer], [true, "pass", "PASS", "understand"]);
    assert.equal(r.output.prefilter.rawGrade, 3);
    assert.deepEqual(calls("CLEFSEC").sort(), ["score", "score", "structure", "understand"]);
    assert.deepEqual([r.category, r.tags], ["industry", ["產業動態", "資訊安全"]]);
    assert.equal(r.title_zh, "OpenSSH 修補未驗證遠端程式碼執行漏洞");
    assert.ok(clefRequests.some((request) => request.questions.relevance));
    assert.ok(clefRequests.some((request) => JSON.stringify(request).includes("CVE-2026-12345")));
  } finally {
    process.env.CLEF_ENABLED = "false";
    resetClefState();
  }
});

test("structure maps a missing security-topic category tag from its explicit non-industry category", async () => {
  const id = await article("SECGUIDE", {
    title: `OpenSSH hardening guide ${T}`,
    bodyText: `SECGUIDE: Administrators can disable password authentication and limit SSH access to approved keys. This defensive configuration guide includes command examples. ${T}`,
  });
  const result = await analyzeArticle(id);
  const r = await row(id);
  assert.deepEqual([result!.output!.selected, r.category, r.tags, r.output.writer], [false, "tip", ["教學/實務", "資訊安全"], "summarize"]);
});

test("a near-selected item is written like a selected one; below the floor it is translated", async () => {
  const near = await analyzeArticle(await article("RESCUE"));
  assert.deepEqual([near!.output!.selected, near!.output!.reasonZh], [false, "理由 RESCUE"], "56 + 50 = 106 > 100");
  const lowId = await article("LOW");
  const low = await analyzeArticle(lowId);
  assert.deepEqual([low!.output!.selected, low!.output!.titleZh, low!.output!.reasonZh], [false, "翻译标题 LOW", null]);
  assert.deepEqual(calls("LOW").sort(), ["prefilter", "score", "score", "structure", "summarize"]);
  const summarize = requests.find((q) => q.marker === "LOW" && q.step === "summarize")!;
  assert.equal(summarize.body.messages.length, 1, "the title/summary prompt is one user message");
  assert.equal(summarize.body.response_format, undefined, "answered in its own text format");
  assert.deepEqual((await row(lowId)).tags, ["模型發布", "推理", "Anthropic"], "structure tags");
});

test("the prefilter's BLOCK stops everything; UNKNOWN goes on like PASS", async () => {
  const off = await analyzeArticle(await article("OFFTOPIC"));
  assert.deepEqual([off!.output!.relevance, off!.output!.selected], ["block", false]);
  assert.deepEqual(calls("OFFTOPIC"), ["prefilter"]);
  // An UNKNOWN with material is judged and written like a PASS, up to 精选 (60 + 62 ≥ 2 × 60).
  const vagueId = await article("VAGUE");
  const vague = await analyzeArticle(vagueId);
  assert.deepEqual([vague!.output!.relevance, vague!.output!.selected, vague!.output!.titleZh], ["pass", true, "理解标题 VAGUE"]);
  assert.equal((await row(vagueId)).output.prefilter.label, "UNKNOWN", "the prefilter's own answer stays on record");
  // Nothing but a title and no page to fetch: the BLOCK counts as UNKNOWN and is scored, but the
  // translation writes nothing from a bare title, so it waits for material instead of being published.
  const bare = await analyzeArticle(await article("BARE", { bodyText: null, excerpt: null, bodyStatus: "none" }));
  assert.deepEqual([bare!.output!.relevance, bare!.output!.selected, bare!.output!.score], ["unknown", false, 32]);
  assert.deepEqual(calls("BARE").sort(), ["prefilter", "score", "score", "structure"]);
});

test("a feed summary alone: the article page is fetched first, then the whole article is judged", async () => {
  const id = await article("THIN", { bodyText: null, bodyStatus: "pending", excerpt: `THIN: a short feed summary (${T}).` });
  // The queue sends it to extraction although its source does not ask for full text (the safety net
  // does the same after a failed fetch, so extraction failures add up to "unconfirmed" and end).
  await queueProcessing(id);
  const [job] = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${id}`;
  assert.equal(job?.name, QUEUES.extractBody);
  const first = await analyzeArticle(id);
  assert.deepEqual([first!.needsBody, first!.output], [true, null]);
  assert.deepEqual(calls("THIN"), [], "no model call before the page");
  assert.equal((await sql`SELECT 1 FROM analyses WHERE article_id = ${id}`).length, 0, "nothing committed");
  // What extraction does: the body lands as a new revision.
  await sql`UPDATE articles SET body_text = ${`THIN: ${LONG} (${T}) full page`}, body_status = 'ok', revision = revision + 1 WHERE id = ${id}`;
  const second = await analyzeArticle(id);
  assert.deepEqual([second!.needsBody ?? false, second!.output!.selected], [false, true]);
});

test("a short post in Chinese is its own copy; a content-filter refusal is translated instead", async () => {
  // The tag rides as a hashtag, which the language check strips.
  const text = `推文：今天把智能体接进了工作流，效果不错。#t${T}`;
  const { articleId } = await upsertMaterial({
    sourceId: X_SOURCE, url: `https://x.com/test/status/1${Date.now()}`, title: text, via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `1${Date.now()}`, authorName: "测试", handle: "test", text },
  });
  const post = await analyzeArticle(articleId);
  assert.deepEqual([post!.output!.titleZh, post!.output!.summaryZh], [text, text]);
  assert.ok(!calls("推文").includes("summarize"), "no translation call");
  const sensitive = await analyzeArticle(await article("SENSITIVE"));
  assert.deepEqual([sensitive!.output!.selected, sensitive!.output!.titleZh], [true, "翻译标题 SENSITIVE"]);
  assert.deepEqual(calls("SENSITIVE").filter((s) => s === "understand" || s === "summarize"), ["understand", "summarize"]);
});

test("guards: a company the input does not name is not written in; long summaries are cut at sentences", () => {
  const input = { title: "某实验室发布新模型", text: "某实验室发布了一个新模型，参数规模和价格都有说明。", sourceKind: "rss" };
  const guarded = enforceIdentity(input, { titleZh: "OpenAI 发布新模型", summaryZh: "某实验室发布新模型。" });
  assert.deepEqual([guarded.titleZh, guarded.summaryZh, guarded.identityGuard.outcome], ["某实验室发布新模型", "某实验室发布新模型。", "fallback"]);
  // The identity lexicon: a Chinese rendering of a company the input names in English is no invention.
  const alibaba = { title: "Alibaba ships a new coding model", text: "Alibaba released a coding model with pricing details.", sourceKind: "rss" };
  assert.equal(enforceIdentity(alibaba, { titleZh: "阿里巴巴发布编程模型", summaryZh: "阿里巴巴发布了编程模型并公布价格。" }).identityGuard.outcome, "pass");
  const long = "第一句交代了谁做了什么以及关键结果，这一句本身已经足够说明核心事件的来龙去脉。".repeat(3) + "第二句补充数字。".repeat(20);
  assert.ok(compactAnswerFirstSummary(long).length <= 190);
  assert.deepEqual(parseTranslateOutput("title_zh: 标题\nsummary_zh: 第一句。\n第二句。"), { titleZh: "标题", summaryZh: "第一句。\n第二句。", bodyZh: "" });
  assert.equal(parseTranslateOutput("title_zh: 标题\nbody_zh: 我们懂你。\n\n来源：X：PixVerse (@PixVerse)").bodyZh, "我们懂你。", "a repeated prompt line is dropped");
});

test("analysing the same revision again reuses every paid answer", async () => {
  scoreAnswers.CLEAR = [80, 70];
  const id = await article("CLEAR", { url: `https://example.com/CLEAR-again-${T}`, title: `CLEAR model release again ${T}` });
  const first = await analyzeArticle(id);
  assert.equal(first!.reused, false);
  const hits = provider.hits();
  const again = await analyzeArticle(id);
  assert.equal(provider.hits(), hits, "no new requests");
  assert.deepEqual([again!.reused, again!.receiptIds], [true, first!.receiptIds]);
});
