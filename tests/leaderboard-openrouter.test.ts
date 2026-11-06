import assert from "node:assert/strict";
import { test } from "node:test";
import { indexOpenRouterRankings, matchMarketStats } from "@aihot/backend/leaderboard/openrouter-rankings";

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

  // Non-existent model returns null
  assert.equal(matchMarketStats(map, "non-existent-model"), null);
});
