import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseAskSearch } from "../packages/backend/src/providers/ask-search.ts";

test("ask search accepts bounded web results and rejects unsafe links", () => {
  const results = parseAskSearch({ data: [
    { title: "Valid", url: "https://example.com/a", description: "News" },
    { title: "Script", url: "javascript:alert(1)" },
    { title: "Credentials", url: "https://u:p@example.com" },
    ...Array.from({ length: 20 }, (_, i) => ({ title: `Result ${i}`, url: `https://example.com/${i}` })),
  ] });
  assert.equal(results.length, 8);
  assert.deepEqual(results[0], { title: "Valid", url: "https://example.com/a", description: "News" });
  assert.ok(results.every((result) => result.url.startsWith("https://example.com/")));
});

test("ask search detects invalid responses", () => {
  assert.throws(() => parseAskSearch({ error: "unavailable" }));
});

import { askSearchTerms } from "../packages/backend/src/publication/ask.ts";

test("segments Chinese natural-language questions into useful bounded terms", () => {
  const terms = askSearchTerms("最近 NVIDIA 和台積電有哪些人工智慧晶片進展？");
  assert.ok(terms.includes("nvidia"));
  assert.ok(terms.includes("台積"));
  assert.ok(!terms.includes("最近"));
  assert.ok(terms.length <= 8);
});

test("search terms escape SQL LIKE wildcards", () => {
  const terms = askSearchTerms("open_ai% test\\name");
  assert.ok(terms.every((term) => !/(?<!\\)[%_]/.test(term)));
});
