import test from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { splitDecisionMaterial, decisionEvidence, belowDecisionCutoff } from "../packages/backend/src/providers/decision-material.ts";
import { CLEF_SELECTION_QUESTIONS } from "../industry/clef-selection.ts";

test("CLEF source splitting covers full mixed-language text without breaking emoji", () => {
  const source = ("完整正文 AI workflow 🧠\n".repeat(600)) + "important final paragraph";
  const parts = splitDecisionMaterial(source);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(""), source);
  for (const part of parts) {
    const units = [...part].reduce((n, c) => n + (c.codePointAt(0)! < 128 ? 1 : 4), 0);
    assert.ok(units <= 1500);
    assert.ok(!/[\uD800-\uDBFF]$/.test(part));
  }
});

test("CLEF gate uses native grade, including the previous rounded boundary", () => {
  assert.equal(belowDecisionCutoff(1.0381371890835998, 35, 35), true);
  assert.equal(belowDecisionCutoff(1.05, 35, 35), false);
  assert.equal(belowDecisionCutoff(undefined, 34, 35), true);
  assert.equal(belowDecisionCutoff(2.1, 70, 68), false);
});

test("CLEF evidence keeps opening and ranks by AI relevance", () => {
  const evidence = decisionEvidence("opening context", [
    { text: "unrelated navigation", relevance: 0.01 },
    { text: "concrete AI workflow", relevance: 0.95 },
    { text: "AI safety event", relevance: 0.90 },
  ]);
  assert.ok(evidence.includes("opening context"));
  assert.ok(evidence.includes("concrete AI workflow"));
  assert.ok(evidence.includes("AI safety event"));
  assert.ok(!evidence.includes("unrelated navigation"));
  assert.equal(CLEF_SELECTION_QUESTIONS.score.type, "score");
  assert.equal(CLEF_SELECTION_QUESTIONS.score.criteria.length, 4);
});


test("production secondary scoring still defaults to one call", () => {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e",
    'import { SCORE_CALLS } from "./packages/backend/src/editorial/analyze.ts"; console.log(SCORE_CALLS);'],
    { cwd: process.cwd(), env: { ...process.env, SCORE_CALLS: "" }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "1");
});
