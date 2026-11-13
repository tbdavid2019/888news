import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCompactCount, parseOpenRouterDecisionsHtml } from "@aihot/backend/leaderboard/openrouter-decisions";

test("parseCompactCount parses k/m/b/t suffixes, requests labels, and plain numbers", () => {
  assert.equal(parseCompactCount("891M requests"), 891_000_000);
  assert.equal(parseCompactCount("51.4M requests"), 51_400_000);
  assert.equal(parseCompactCount("2b"), 2_000_000_000);
  assert.equal(parseCompactCount("12.5k"), 12_500);
  assert.equal(parseCompactCount("1,234"), 1234);
  assert.equal(parseCompactCount("invalid"), null);
});

test("parseOpenRouterDecisionsHtml extracts 5-column Rank | Model | Author | requests | Change table", () => {
  const html = `
    <html><body>
      <table class="or-table">
        <thead><tr><th>Rank</th><th>Model</th><th>Author</th><th>requests</th><th>Change</th></tr></thead>
        <tbody>
          <tr class="or-table__row"><td>1</td><th>Jev 1.13</th><td>typesafe</td><td>891M requests</td><td>-15%</td></tr>
          <tr class="or-table__row"><td>2</td><th>Others</th><td>various</td><td>10M requests</td><td>0%</td></tr>
          <tr class="or-table__row"><td>3</td><th>Decider V1.2</th><td>perplexity</td><td>295M requests</td><td>+62%</td></tr>
        </tbody>
      </table>
      <table class="or-table">
        <thead><tr><th>Rank</th><th>Author</th><th>Share of requests</th><th>Change in requests</th></tr></thead>
        <tbody><tr><td>1</td><th>TypeSafe</th><td>71.1%</td><td>+3%</td></tr></tbody>
      </table>
    </body></html>
  `;

  const entries = parseOpenRouterDecisionsHtml(html);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    rank: 1,
    openrouterRank: 1,
    id: "typesafe/jev-1-13",
    name: "Jev 1.13",
    author: "typesafe",
    requests: 891_000_000,
    requestsText: "891M requests",
    change: "-15%",
    modelSlug: null,
  });
  assert.deepEqual(entries[1], {
    rank: 2,
    openrouterRank: 3,
    id: "perplexity/decider-v-1-2",
    name: "Decider V1.2",
    author: "perplexity",
    requests: 295_000_000,
    requestsText: "295M requests",
    change: "+62%",
    modelSlug: null,
  });
});
