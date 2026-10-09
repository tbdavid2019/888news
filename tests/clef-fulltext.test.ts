import { stub, tag } from "./setup.ts";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { loadAnalyzeInput, runAnalysis, analyzeArticle } from "@aihot/backend/editorial/analyze";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { evaluateWithDecisionEngine, resetClefState } from "../packages/backend/src/providers/jev.ts";

config.allowPrivateNetworkFetch = true; // This file calls only its localhost CLEF stub.

const requests: Array<{ state: string; questions: Record<string, unknown> }> = [];
const provider = await stub((_hit, req) => {
  const input = JSON.parse(req.body);
  requests.push(input);
  const fragment = !input.questions.category;
  return {
    model: "clef-flash", answers: {
      relevance: { type: "choice", choice: "PASS", confidence: 0.9, probabilities: { PASS: 0.9, BLOCK: 0.05, UNKNOWN: 0.05 } },
      score: { type: "score", score: fragment ? 3 : 1.0381371890835998, confidence: 0.9 },
      category: { type: "choice", choice: "tip", confidence: 0.9 },
    }, usage: { input_tokens: 2000, output_tokens: 0 },
  };
});
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

test("CLEF reads every full-text fragment, re-evaluates evidence and reuses audited receipts", async () => {
  process.env.CLEF_ENABLED = "true";
  process.env.CLEF_BASE_URL = provider.url;
  process.env.CLEF_FALLBACK_BASE_URL = "";
  resetClefState();
  const body = "full article content ".repeat(500) + "FINAL SOURCE EVIDENCE";
  const material = { title: `Full text ${tag()}`, bodyText: body };
  const result = await evaluateWithDecisionEngine(material);
  const fragments = requests.filter((r) => !r.questions.category);
  assert.ok(fragments.length > 1);
  assert.equal(fragments.map((r) => r.state.split("\n\n").slice(1).join("\n\n")).join(""), body);
  assert.equal(requests.at(-1)?.questions.score && (requests.at(-1)!.questions.score as { type: string }).type, "score");
  assert.equal(result.rawGrade, 1.0381371890835998);
  assert.equal(result.receiptIds.length, requests.length);
  assert.equal(result.score, 35); // Display only; native gate rejects this boundary.
  const count = requests.length;
  const cached = await evaluateWithDecisionEngine(material);
  assert.equal(requests.length, count);
  assert.equal(cached.reused, true);
  assert.equal(cached.receiptId, result.receiptId);
});


test("production cutoff rejects native 1.038 without calling the secondary model", async () => {
  process.env.NOISE_SCORE_CUTOFF = "35";
  const source = `clef-gate-${tag()}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${source}, 'CLEF gate test', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const material = await upsertMaterial({ sourceId: source, url: `https://example.com/${source}`,
    title: source, bodyText: "Concrete AI method with evidence. ".repeat(70), bodyStatus: "ok", via: "fetch" });
  const article = await loadAnalyzeInput(material.articleId);
  assert.ok(article);
  const result = await runAnalysis(article);
  assert.equal(result.prefilter.rawGrade, 1.0381371890835998);
  assert.equal(result.scores?.model, "clef-flash");
  assert.deepEqual(result.scores?.values, [35]);
  assert.equal(result.writing?.kind, "none");
  assert.equal(result.structure, null);
  const committed = await analyzeArticle(material.articleId);
  assert.ok(committed);
  assert.ok(committed.receiptIds.length > 1, "fragment receipts join the final judgement");
  const [analysis] = await sql`SELECT output FROM analyses WHERE id = ${committed.analysisId!}`;
  assert.equal(analysis!.output.prefilter.rawGrade, 1.0381371890835998);
  const receipts = await sql`SELECT status FROM receipts WHERE id = ANY(${committed.receiptIds})`;
  assert.ok(receipts.every((r) => r.status === "completed"));
});
