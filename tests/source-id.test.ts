import test from "node:test";
import assert from "node:assert/strict";
import { CreateSchema, sourceIdentity } from "../packages/backend/src/admin/sources.ts";
import { extractHandle } from "../packages/backend/src/sources/x.ts";

test("CreateSchema validates and accepts source IDs with leading underscores (e.g. _mohansolo)", () => {
  const baseValid = {
    name: "Mohan Solo",
    kind: "x_search" as const,
    config: { query: "from:_mohansolo -filter:replies", searchType: "Latest" },
  };

  // Underscore-first handle (like Twitter handles)
  const parsed1 = CreateSchema.parse({ ...baseValid, id: "_mohansolo" });
  assert.equal(parsed1.id, "_mohansolo");

  // Leading @ should be trimmed and lowercased
  const parsed2 = CreateSchema.parse({ ...baseValid, id: "@_mohansolo" });
  assert.equal(parsed2.id, "_mohansolo");

  // Whitespace around handle should be trimmed
  const parsed3 = CreateSchema.parse({ ...baseValid, id: "  _mohansolo  " });
  assert.equal(parsed3.id, "_mohansolo");

  // Standard alphanumeric handles
  const parsed4 = CreateSchema.parse({ ...baseValid, id: "elonmusk" });
  assert.equal(parsed4.id, "elonmusk");

  // Middle underscore and hyphen
  const parsed5 = CreateSchema.parse({ ...baseValid, id: "vivago_ai" });
  assert.equal(parsed5.id, "vivago_ai");

  const parsed6 = CreateSchema.parse({ ...baseValid, id: "rss-google-ai" });
  assert.equal(parsed6.id, "rss-google-ai");

  // Single character IDs
  const parsed7 = CreateSchema.parse({ ...baseValid, id: "_" });
  assert.equal(parsed7.id, "_");

  const parsed8 = CreateSchema.parse({ ...baseValid, id: "x" });
  assert.equal(parsed8.id, "x");
});

test("CreateSchema rejects invalid source IDs", () => {
  const base = {
    name: "Test Source",
    kind: "x_search" as const,
    config: { query: "from:test -filter:replies" },
  };

  // Leading hyphen should be rejected
  assert.throws(() => CreateSchema.parse({ ...base, id: "-invalid" }), /信源 ID 僅支援小寫英數字、底線/);

  // Invalid characters
  assert.throws(() => CreateSchema.parse({ ...base, id: "has space" }), /信源 ID 僅支援小寫英數字、底線/);
  assert.throws(() => CreateSchema.parse({ ...base, id: "invalid!id" }), /信源 ID 僅支援小寫英數字、底線/);
  assert.throws(() => CreateSchema.parse({ ...base, id: "" }), /信源 ID 僅支援小寫英數字、底線/);
  assert.throws(() => CreateSchema.parse({ ...base, id: "a".repeat(81) }), /信源 ID 僅支援小寫英數字、底線/);
});

test("sourceIdentity and extractHandle correctly resolve handles with leading underscores", () => {
  // Query with from:_mohansolo
  const id1 = sourceIdentity("x_search", { query: "from:_mohansolo -filter:replies" }, "_mohansolo");
  assert.equal(id1, "x:_mohansolo");

  // Query with from:@_mohansolo
  const id2 = sourceIdentity("x_search", { query: "from:@_mohansolo -filter:replies" }, "_mohansolo");
  assert.equal(id2, "x:_mohansolo");

  // Handle explicitly in config
  const id3 = sourceIdentity("x_search", { handle: "@_mohansolo" });
  assert.equal(id3, "x:_mohansolo");

  // Fallback to sourceId
  const id4 = sourceIdentity("x_search", {}, "_mohansolo");
  assert.equal(id4, "x:_mohansolo");

  // extractHandle
  const handle1 = extractHandle({ id: "_mohansolo", name: "Mohan", config: { query: "from:_mohansolo -filter:replies" } });
  assert.equal(handle1, "_mohansolo");

  const handle2 = extractHandle({ id: "_mohansolo", name: "Mohan", config: { query: "from:@_mohansolo -filter:replies" } });
  assert.equal(handle2, "_mohansolo");

  const handle3 = extractHandle({ id: "x-_mohansolo", name: "Mohan", config: {} });
  assert.equal(handle3, "_mohansolo");
});
