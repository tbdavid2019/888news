import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { indexOpenRouterRankings, loadOpenRouterRankings, loadSeedRankings, matchMarketStats, SEED_FILE } from "@aihot/backend/leaderboard/openrouter-rankings";

test("indexOpenRouterRankings correctly orders by token volume and matches dated or undated model slugs", () => {
  const items = [
    {
      date: "2026-11-05 00:00:00",
      model_permaslug: "google/gemini-4-argon-20261013",
      rankingMetricValue: 1_304_682_268_100,
      count: 29_765_106,
    },
    {
      date: "2026-11-05 00:00:00",
      model_permaslug: "deepseek/deepseek-v4.1-flash-20261017",
      rankingMetricValue: 56_486_111_532_750,
      count: 881_057_797,
    },
    {
      date: "2026-11-05 00:00:00",
      model_permaslug: "openai/gpt-6.1-sol-20260929",
      rankingMetricValue: 3_619_089_890_898,
      count: 144_288_510,
    },
    {
      date: "2026-11-05 00:00:00",
      model_permaslug: "anthropic/claude-5-fable-20260609",
      rankingMetricValue: 800_000_000_000,
      count: 10_000_000,
    },
  ];

  const indexed = indexOpenRouterRankings(items, "2026-11-05");
  const map = new Map(Object.entries(indexed));

  // #1 must be deepseek-v4.1-flash because it has the highest token count
  const deepseek = matchMarketStats(map, "deepseek-v-4-1-flash");
  assert.ok(deepseek);
  assert.equal(deepseek.openrouterRank, 1);
  assert.equal(deepseek.totalTokens, 56_486_111_532_750);
  assert.equal(deepseek.totalRequests, 881_057_797);
  assert.equal(deepseek.date, "2026-11-05");

  // Undated alias deepseek-v4-1-flash should also match
  const deepseekAlias = matchMarketStats(map, "deepseek-v4-1-flash");
  assert.ok(deepseekAlias, "deepseek-v4-1-flash alias should match without date suffix");
  assert.equal(deepseekAlias.openrouterRank, 1);

  // #2 must be gpt-6.1-sol
  const sol = matchMarketStats(map, "gpt-6-1-sol");
  assert.ok(sol);
  assert.equal(sol.openrouterRank, 2);
  assert.equal(sol.totalTokens, 3_619_089_890_898);

  // #3 must be gemini-4-argon
  const argon = matchMarketStats(map, "gemini-4-argon");
  assert.ok(argon);
  assert.equal(argon.openrouterRank, 3);
  assert.equal(argon.totalTokens, 1_304_682_268_100);

  // Match with dated slug as well
  const datedArgon = matchMarketStats(map, "gemini-4-argon-2026-10-13");
  assert.ok(datedArgon);
  assert.equal(datedArgon.openrouterRank, 3);

  // #4 must be claude-fable-5, matching OpenRouter claude-5-fable alias
  const claudeFable = matchMarketStats(map, "claude-fable-5");
  assert.ok(claudeFable, "claude-fable-5 should match OpenRouter claude-5-fable alias");
  assert.equal(claudeFable.openrouterRank, 4);
  assert.equal(claudeFable.permaslug, "anthropic/claude-5-fable-20260609");

  // Bidirectional check: claude-5-fable should also match
  const claude5Fable = matchMarketStats(map, "claude-5-fable");
  assert.ok(claude5Fable, "claude-5-fable should also match bidirectionally");
  assert.equal(claude5Fable.openrouterRank, 4);

  // Non-existent model returns null
  assert.equal(matchMarketStats(map, "non-existent-model"), null);
});

test("loadSeedRankings loads fallback market stats from local seed JSON", () => {
  assert.ok(existsSync(SEED_FILE), `SEED_FILE should exist at ${SEED_FILE}`);
  const seed = loadSeedRankings();
  const count = Object.keys(seed).length;
  assert.ok(count >= 1100, `seed file should yield at least 1100 indexed entries, got ${count}`);

  const map = new Map(Object.entries(seed));

  // Claude Fable 5
  const fable = matchMarketStats(map, "claude-fable-5");
  assert.ok(fable, "seed should match claude-fable-5");
  assert.equal(fable.permaslug, "anthropic/claude-5-fable-20260609");
  assert.equal(fable.openrouterRank, 133);

  // Gemini 4 Argon
  const argon = matchMarketStats(map, "gemini-4-argon");
  assert.ok(argon, "seed should match gemini-4-argon");
  assert.equal(argon.permaslug, "google/gemini-4-argon-20261013");
  assert.equal(argon.openrouterRank, 29);

  // Claude Opus 5.5
  const opus = matchMarketStats(map, "claude-opus-5-5");
  assert.ok(opus, "seed should match claude-opus-5-5");
  assert.equal(opus.permaslug, "anthropic/claude-opus-5.5-20260921");
  assert.equal(opus.openrouterRank, 7);

  // GPT-6 Astra
  const astra = matchMarketStats(map, "gpt-6-astra");
  assert.ok(astra, "seed should match gpt-6-astra");
  assert.equal(astra.permaslug, "openai/gpt-6-astra-20260903");
  assert.equal(astra.openrouterRank, 49);

  // DeepSeek V4.1 Flash
  const deepseek = matchMarketStats(map, "deepseek-v4-1-flash");
  assert.ok(deepseek, "seed should match deepseek-v4-1-flash");
  assert.equal(deepseek.permaslug, "deepseek/deepseek-v4.1-flash-20261017");
  assert.equal(deepseek.openrouterRank, 1);
});

test("loadOpenRouterRankings returns map with baseline seed models guaranteed", async () => {
  const map = await loadOpenRouterRankings();
  assert.ok(map.size >= 1100, `loadOpenRouterRankings should return map with at least 1100 items, got ${map.size}`);

  const argon = matchMarketStats(map, "gemini-4-argon");
  assert.ok(argon, "loadOpenRouterRankings map must include gemini-4-argon");
  assert.ok(argon.openrouterRank != null && argon.openrouterRank > 0);

  const opus = matchMarketStats(map, "claude-opus-5-5");
  assert.ok(opus, "loadOpenRouterRankings map must include claude-opus-5-5");
  assert.ok(opus.openrouterRank != null && opus.openrouterRank > 0);

  const astra = matchMarketStats(map, "gpt-6-astra");
  assert.ok(astra, "loadOpenRouterRankings map must include gpt-6-astra");
  assert.ok(astra.openrouterRank != null && astra.openrouterRank > 0);

  const fable = matchMarketStats(map, "claude-fable-5");
  assert.ok(fable, "loadOpenRouterRankings map must include claude-fable-5");
  assert.ok(fable.openrouterRank != null && fable.openrouterRank > 0);
});
