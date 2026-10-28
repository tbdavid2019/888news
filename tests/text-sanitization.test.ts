import test from "node:test";
import assert from "node:assert/strict";
import { stripTags } from "../packages/backend/src/lib/text.ts";
import { cleanArticleTextForLLM } from "../packages/backend/src/editorial/writing.ts";

test("stripTags parses markup and decodes entities once", () => {
  assert.equal(stripTags("<p>Alpha &amp; Beta</p><script>alert(1)</script><p>&amp;lt;script&amp;gt;</p>"), "Alpha & Beta &lt;script&gt;");
});

test("cleanArticleTextForLLM preserves paragraph breaks and removes active markup", () => {
  assert.equal(cleanArticleTextForLLM("<p>First &amp; safe</p><script>ignore this</script><p>Second https://example.invalid/path</p>"), "First & safe\nSecond");
});
