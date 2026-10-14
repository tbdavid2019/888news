import assert from "node:assert/strict";
import { test } from "node:test";
import { evalPodcastDecisionLogic } from "@aihot/backend/editorial/podcast";

test("evalPodcastDecisionLogic marks PASS high-score episodes as selected", () => {
  const result = evalPodcastDecisionLogic({
    label: "PASS",
    score: 85,
    category: "ai-models",
    authorRole: "principal",
  });
  assert.equal(result.label, "PASS");
  assert.equal(result.score, 85);
  assert.equal(result.selected, true);
  assert.equal(result.category, "ai-models");
  assert.equal(result.authorRole, "principal");
});

test("evalPodcastDecisionLogic blocks off-topic episodes", () => {
  const result = evalPodcastDecisionLogic({
    label: "BLOCK",
    score: 90,
  });
  assert.equal(result.label, "BLOCK");
  assert.equal(result.selected, false);
});

test("evalPodcastDecisionLogic keeps low noise scores unselected", () => {
  const result = evalPodcastDecisionLogic({
    label: "PASS",
    score: 25,
  });
  assert.equal(result.selected, false);
});
