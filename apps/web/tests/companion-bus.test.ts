import test from "node:test";
import assert from "node:assert/strict";
import {
  openCompanion,
  closeCompanion,
  toggleCompanion,
  setCompanionContext,
  clearPendingQuestion,
  getCompanionState,
  subscribeCompanion,
} from "../app/lib/companion-bus.ts";

test("companion bus manages open/close state and pending questions", () => {
  let notified = 0;
  const unsubscribe = subscribeCompanion(() => {
    notified++;
  });

  // Test opening companion with question and context
  openCompanion({
    title: "測試文章標題",
    summary: "測試摘要",
    url: "https://example.com/test",
    question: "這篇文章說了什麼？",
  });

  let state = getCompanionState();
  assert.equal(state.isOpen, true);
  assert.equal(state.context?.title, "測試文章標題");
  assert.equal(state.context?.summary, "測試摘要");
  assert.equal(state.context?.url, "https://example.com/test");
  assert.equal(state.pendingQuestion, "這篇文章說了什麼？");
  assert.ok(notified > 0);

  // Clear pending question
  clearPendingQuestion();
  assert.equal(getCompanionState().pendingQuestion, undefined);

  // Close companion
  closeCompanion();
  assert.equal(getCompanionState().isOpen, false);

  // Toggle companion
  toggleCompanion();
  assert.equal(getCompanionState().isOpen, true);
  toggleCompanion();
  assert.equal(getCompanionState().isOpen, false);

  // Set companion context directly
  setCompanionContext({ title: "另一篇", summary: "另一篇摘要" });
  assert.equal(getCompanionState().context?.title, "另一篇");

  unsubscribe();
});
