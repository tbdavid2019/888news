import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMcpServer } from "../apps/api/src/routes/mcp.ts";
import { MCP_TOOL_NAMES, MCP_TOOLS } from "@aihot/contracts/mcp";
import { LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";

test("buildMcpServer registers exactly all 9 tools matching MCP_TOOL_NAMES", () => {
  const server = buildMcpServer();
  const registeredTools = (server as unknown as { _registeredTools: Record<string, { description?: string; inputSchema?: { safeParse: (v: unknown) => { success: boolean; data?: unknown } } }> })._registeredTools;

  const toolKeys = Object.keys(registeredTools);
  const expectedNames = Object.values(MCP_TOOL_NAMES);

  assert.equal(toolKeys.length, 9, `Expected exactly 9 registered tools, got ${toolKeys.length}`);
  assert.equal(expectedNames.length, 9, `Expected 9 tool names in MCP_TOOL_NAMES, got ${expectedNames.length}`);
  assert.equal(MCP_TOOLS.length, 9, `Expected 9 tools in MCP_TOOLS, got ${MCP_TOOLS.length}`);

  for (const name of expectedNames) {
    const tool = registeredTools[name];
    assert.ok(tool, `Tool ${name} should be registered on McpServer`);
    assert.ok(tool.description && tool.description.length > 0, `Tool ${name} should have a description`);
    assert.ok(tool.inputSchema, `Tool ${name} should have an inputSchema`);
  }

  // Set equality: no extra or missing tools
  assert.deepEqual(new Set(toolKeys), new Set(expectedNames));
});

test("leaderboard tool inputSchema boundary validation", () => {
  const server = buildMcpServer();
  const registeredTools = (server as unknown as { _registeredTools: Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: { board: string; limit: number } } } }> })._registeredTools;
  const schema = registeredTools[MCP_TOOL_NAMES.leaderboard].inputSchema;

  // Defaults
  const def = schema.safeParse({});
  assert.equal(def.success, true);
  assert.equal(def.data?.board, "overall");
  assert.equal(def.data?.limit, 20);

  // All valid boards
  for (const board of LEADERBOARD_PUBLIC_BOARDS) {
    assert.equal(schema.safeParse({ board }).success, true);
  }

  // Invalid board
  assert.equal(schema.safeParse({ board: "non_existent_board" }).success, false);

  // Boundary for limit: [1, 50]
  assert.equal(schema.safeParse({ limit: 1 }).success, true);
  assert.equal(schema.safeParse({ limit: 50 }).success, true);
  assert.equal(schema.safeParse({ limit: 0 }).success, false);
  assert.equal(schema.safeParse({ limit: -1 }).success, false);
  assert.equal(schema.safeParse({ limit: 51 }).success, false);
  assert.equal(schema.safeParse({ limit: 10.5 }).success, false);

  // Strict object: rejects unknown fields
  assert.equal(schema.safeParse({ extra: "unexpected" }).success, false);
});

test("model tool inputSchema boundary validation", () => {
  const server = buildMcpServer();
  const registeredTools = (server as unknown as { _registeredTools: Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: { slug: string } } } }> })._registeredTools;
  const schema = registeredTools[MCP_TOOL_NAMES.model].inputSchema;

  // Valid slugs
  assert.equal(schema.safeParse({ slug: "gemini-4-argon" }).success, true);
  assert.equal(schema.safeParse({ slug: "gpt-6-1-sol" }).success, true);
  assert.equal(schema.safeParse({ slug: "a" }).success, true);
  assert.equal(schema.safeParse({ slug: "a".repeat(80) }).success, true);

  // Empty or missing slug
  assert.equal(schema.safeParse({}).success, false);
  assert.equal(schema.safeParse({ slug: "" }).success, false);

  // Slug too long (> 80)
  assert.equal(schema.safeParse({ slug: "a".repeat(81) }).success, false);

  // Strict object: rejects unknown fields
  assert.equal(schema.safeParse({ slug: "test", extra: 1 }).success, false);
});

test("podcasts tool inputSchema boundary validation", () => {
  const server = buildMcpServer();
  const registeredTools = (server as unknown as { _registeredTools: Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: { category?: string; q?: string; limit?: number } } } }> })._registeredTools;
  const schema = registeredTools[MCP_TOOL_NAMES.podcasts].inputSchema;

  // Optional fields: empty object is valid
  const def = schema.safeParse({});
  assert.equal(def.success, true);
  assert.equal(def.data?.limit, 20);
  assert.equal(schema.safeParse({ category: "tech" }).success, true);
  assert.equal(schema.safeParse({ q: "Silicon" }).success, true);
  assert.equal(schema.safeParse({ category: "business", q: "Ventures", limit: 15 }).success, true);

  // Boundary for limit: [1, 30]
  assert.equal(schema.safeParse({ limit: 1 }).success, true);
  assert.equal(schema.safeParse({ limit: 30 }).success, true);
  assert.equal(schema.safeParse({ limit: 0 }).success, false);
  assert.equal(schema.safeParse({ limit: 31 }).success, false);

  // Strict object: rejects unknown fields
  assert.equal(schema.safeParse({ unknownField: "bad" }).success, false);
});

test("podcast_episodes tool inputSchema boundary validation", () => {
  const server = buildMcpServer();
  const registeredTools = (server as unknown as { _registeredTools: Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: { q?: string; channel_id?: string; limit: number } } } }> })._registeredTools;
  const schema = registeredTools[MCP_TOOL_NAMES.podcast_episodes].inputSchema;

  // Defaults
  const def = schema.safeParse({});
  assert.equal(def.success, true);
  assert.equal(def.data?.limit, 10);

  // Valid queries
  assert.equal(schema.safeParse({ q: "NVDA", channel_id: "all-in", limit: 5 }).success, true);
  assert.equal(schema.safeParse({ q: "TSMC" }).success, true);

  // Boundary for limit: [1, 30]
  assert.equal(schema.safeParse({ limit: 1 }).success, true);
  assert.equal(schema.safeParse({ limit: 30 }).success, true);
  assert.equal(schema.safeParse({ limit: 0 }).success, false);
  assert.equal(schema.safeParse({ limit: 31 }).success, false);
  assert.equal(schema.safeParse({ limit: 12.3 }).success, false);

  // Strict object: rejects unknown fields
  assert.equal(schema.safeParse({ foo: "bar" }).success, false);
});

test("existing tools (latest, search, hot, story, daily) preserve schema boundaries", () => {
  const server = buildMcpServer();
  const registeredTools = (server as unknown as { _registeredTools: Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }> })._registeredTools;

  // latest
  const latestSchema = registeredTools[MCP_TOOL_NAMES.latest].inputSchema;
  assert.equal(latestSchema.safeParse({ window: "24h", limit: 10 }).success, true);
  assert.equal(latestSchema.safeParse({ limit: 0 }).success, false);
  assert.equal(latestSchema.safeParse({ limit: 31 }).success, false);

  // search
  const searchSchema = registeredTools[MCP_TOOL_NAMES.search].inputSchema;
  assert.equal(searchSchema.safeParse({ q: "AI" }).success, true);
  assert.equal(searchSchema.safeParse({ q: "A" }).success, false); // min 2
  assert.equal(searchSchema.safeParse({ q: "test", limit: 31 }).success, false);

  // hot
  const hotSchema = registeredTools[MCP_TOOL_NAMES.hot].inputSchema;
  assert.equal(hotSchema.safeParse({ limit: 5 }).success, true);
  assert.equal(hotSchema.safeParse({ limit: 11 }).success, false);

  // story
  const storySchema = registeredTools[MCP_TOOL_NAMES.story].inputSchema;
  assert.equal(storySchema.safeParse({ public_id: "xyz" }).success, true);
  assert.equal(storySchema.safeParse({ public_id: "" }).success, false);
  assert.equal(storySchema.safeParse({ public_id: "xyz", report_limit: 51 }).success, false);

  // daily
  const dailySchema = registeredTools[MCP_TOOL_NAMES.daily].inputSchema;
  assert.equal(dailySchema.safeParse({}).success, true);
  assert.equal(dailySchema.safeParse({ date: "2026-11-06" }).success, true);
  assert.equal(dailySchema.safeParse({ date: "invalid-date" }).success, false);
});
