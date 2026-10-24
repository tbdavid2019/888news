import test from "node:test";
import assert from "node:assert/strict";
import { CreateSchema, sourceIdentity } from "../packages/backend/src/admin/sources.ts";
import { extractHandle, parseXSsrTimeline, sanitizeJsStringLiteral } from "../packages/backend/src/sources/x.ts";

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

  // Handles extracted from full URLs
  const handle4 = extractHandle({ id: "orca_build", name: "orca", config: { url: "https://x.com/orca_build/" } });
  assert.equal(handle4, "orca_build");

  const handle5 = extractHandle({ id: "orca_build", name: "orca", config: { handle: "https://x.com/orca_build" } });
  assert.equal(handle5, "orca_build");

  const handle6 = extractHandle({ id: "https://x.com/orca_build/", name: "orca", config: {} });
  assert.equal(handle6, "orca_build");
});

test("CreateSchema sanitizes full X/Twitter profile URLs in ID field", () => {
  const base = {
    name: "Orca Build",
    kind: "x_search" as const,
    config: { query: "from:orca_build -filter:replies" },
  };

  const p1 = CreateSchema.parse({ ...base, id: "https://x.com/orca_build/" });
  assert.equal(p1.id, "orca_build");

  const p2 = CreateSchema.parse({ ...base, id: "https://twitter.com/orca_build" });
  assert.equal(p2.id, "orca_build");

  const p3 = CreateSchema.parse({ ...base, id: "@orca_build" });
  assert.equal(p3.id, "orca_build");

  const p4 = CreateSchema.parse({ ...base, id: "https://x.com/@orca_build" });
  assert.equal(p4.id, "orca_build");
});

test("sanitizeJsStringLiteral handles Seroval/Twitter SSR escapes", () => {
  const raw = "hello \\x3Cworld\\x3E it\\'s a test";
  const cleaned = sanitizeJsStringLiteral(raw);
  assert.equal(cleaned, "hello \\u003Cworld\\u003E it's a test");
  assert.equal(JSON.parse(`"${cleaned}"`), "hello <world> it's a test");
});

test("parseXSsrTimeline correctly extracts tweets, handles timestamps and ignores pinned/retweets", () => {
  const mockTimelinePayload = {
    data: {
      user_result_by_screen_name: {
        result: {
          profile_user_originals_timeline: {
            timeline: {
              instructions: [
                {
                  __typename: "TimelinePinEntry",
                  entry: { content: { content: { tweet_results: { result: { rest_id: "999999999999999999" } } } } },
                },
                {
                  __typename: "TimelineAddEntries",
                  entries: [
                    // Valid tweet with millisecond string timestamp and media
                    {
                      content: {
                        content: {
                          tweet_results: {
                            result: {
                              rest_id: "2113721479435260138",
                              core: {
                                user_results: {
                                  result: {
                                    core: { name: "Orca", screen_name: "orca_build" },
                                    avatar: { image_url: "https://pbs.twimg.com/profile_images/123/avatar.jpg" },
                                  },
                                },
                              },
                              details: {
                                full_text: "Major UI overhaul sneak peek!",
                                created_at_ms: "1792785446000",
                              },
                              media_entities2: [
                                {
                                  type: "photo",
                                  media_url_https: "https://pbs.twimg.com/media/HVVxZF-bgAArUjg.jpg",
                                  original_info: { width: 1200, height: 600 },
                                },
                              ],
                              views: { count: "5000" },
                              counts: { favorite_count: 100, retweet_count: 10 },
                            },
                          },
                        },
                      },
                    },
                    // Retweet should be filtered out
                    {
                      content: {
                        content: {
                          tweet_results: {
                            result: {
                              rest_id: "2113721479435260999",
                              legacy: {
                                retweeted_status_result: { result: {} },
                                full_text: "RT @someone: something",
                              },
                            },
                          },
                        },
                      },
                    },
                    // Reply should be filtered out
                    {
                      content: {
                        content: {
                          tweet_results: {
                            result: {
                              rest_id: "2113721479435260888",
                              legacy: {
                                in_reply_to_status_id_str: "111111",
                                full_text: "@user reply message",
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  };

  const escapedJson = JSON.stringify(JSON.stringify(mockTimelinePayload)).slice(1, -1);
  const mockHtml = `<script>($R=>$R[1]={kind:"Result.Ok",value:"${escapedJson}"})</script>`;

  const result = parseXSsrTimeline(mockHtml, "orca_build");
  assert.equal(result.timelineFound, true);
  assert.equal(result.candidates.length, 1);

  const candidate = result.candidates[0]!;
  assert.equal(candidate.identityKey, "x:2113721479435260138");
  assert.equal(candidate.url, "https://x.com/orca_build/status/2113721479435260138");
  assert.equal(candidate.title, "Major UI overhaul sneak peek!");
  assert.equal(candidate.publishedAt?.toISOString(), "2026-10-23T19:57:26.000Z");
  assert.equal(candidate.media?.length, 1);
  assert.equal(candidate.media?.[0]?.url, "https://pbs.twimg.com/media/HVVxZF-bgAArUjg.jpg");
  assert.equal((candidate.raw as Record<string, unknown>)?.views, 5000);
  assert.equal((candidate.raw as Record<string, unknown>)?.favorite, 100);
});
