import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractModelLinks,
  formatModelSlugFallback,
  normalizeShare,
  parseCategoryRankingsJson,
  parseCompactCount,
  parseOpenRouterDecisionsHtml,
  parseOpenRouterMarketShareHtml,
} from "@aihot/backend/leaderboard/openrouter-decisions";

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

test("parseOpenRouterMarketShareHtml extracts Table 1 author market share entries", () => {
  const html = `
    <html><body>
      <table class="or-table">
        <thead><tr><th>Rank</th><th>Author</th><th>Share of requests</th><th>Change in requests</th></tr></thead>
        <tbody>
          <tr><td>1</td><th>TypeSafe</th><td>71.1%</td><td>+3%</td></tr>
          <tr><td>2</td><th>Perplexity</th><td>11.0%</td><td>+45%</td></tr>
          <tr><td>9</td><th>Microsoft</th><td>0.6%</td><td></td></tr>
          <tr><td></td><th>All other authors</th><td>0.6%</td><td>-29%</td></tr>
        </tbody>
      </table>
    </body></html>
  `;

  const items = parseOpenRouterMarketShareHtml(html);
  assert.equal(items.length, 4);
  assert.deepEqual(items[0], {
    rank: 1,
    author: "TypeSafe",
    sharePercent: 71.1,
    shareText: "71.1%",
    change: "+3%",
  });
  assert.deepEqual(items[1], {
    rank: 2,
    author: "Perplexity",
    sharePercent: 11.0,
    shareText: "11.0%",
    change: "+45%",
  });
  assert.deepEqual(items[2], {
    rank: 9,
    author: "Microsoft",
    sharePercent: 0.6,
    shareText: "0.6%",
    change: null,
  });
  assert.deepEqual(items[3], {
    rank: null,
    author: "All other authors",
    sharePercent: 0.6,
    shareText: "0.6%",
    change: "-29%",
  });
});

test("formatModelSlugFallback extracts author and formatted name", () => {
  assert.deepEqual(formatModelSlugFallback("typesafe/jev-1.13-20260917"), {
    name: "Jev 1.13",
    author: "typesafe",
  });
  assert.deepEqual(formatModelSlugFallback("openai/gpt-6-luna-decisions-20261006"), {
    name: "GPT 6 Luna Decisions",
    author: "openai",
  });
  assert.deepEqual(formatModelSlugFallback("cloudflare/clef-flash"), {
    name: "Clef Flash",
    author: "cloudflare",
  });
  assert.deepEqual(formatModelSlugFallback("standalone-model"), {
    name: "Standalone Model",
    author: "",
  });
});

test("extractModelLinks parses model metadata from SSR payload", () => {
  const ssr = `
    something,"modelLinks\":{\"typesafe/jev-1.13-20260917\":{\"shortName\":\"Jev 1.13\",\"author\":\"typesafe\"},\"openai/gpt-6-luna-decisions-20261006\":{\"shortName\":\"GPT-6 Luna\",\"author\":\"openai\"}}
  `;
  const map = extractModelLinks(ssr);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get("typesafe/jev-1.13-20260917"), {
    name: "Jev 1.13",
    author: "typesafe",
  });
  assert.deepEqual(map.get("openai/gpt-6-luna-decisions-20261006"), {
    name: "GPT-6 Luna",
    author: "openai",
  });
});

test("normalizeShare clamps negative numbers, invalid values, and converts percentages > 1", () => {
  assert.equal(normalizeShare(null), 0);
  assert.equal(normalizeShare(-5), 0);
  assert.equal(normalizeShare(0.45), 0.45);
  assert.equal(normalizeShare(71.1), 0.711);
  assert.equal(normalizeShare(120), 1);
});

test("parseCategoryRankingsJson parses categories, sorts by shareOfTotal, and resolves model names", () => {
  const jsonPayload = JSON.stringify({
    data: {
      spend: {
        categories: [
          {
            value: "business_operations",
            label: "Business operations",
            shareOfTotal: 0.118,
            models: [
              { model: "typesafe/jev-1.13-20260917", share: 0.728, deltaPp: -23.5 },
            ],
          },
          {
            value: "software_technology",
            label: "Software & technology",
            shareOfTotal: 0.278,
            models: [
              { model: "typesafe/jev-1.14-20261014", share: 0.263, deltaPp: 26.3 },
              { model: "typesafe/jev-1.13-20260917", share: 0.555, deltaPp: -38.6 },
              { model: "cloudflare/clef-flash", share: 0.05, deltaPp: 2.1 },
            ],
          },
        ],
      },
    },
  });

  const links = new Map([
    ["typesafe/jev-1.13-20260917", { name: "Jev 1.13", author: "typesafe" }],
  ]);

  const groups = parseCategoryRankingsJson(jsonPayload, links);
  assert.equal(groups.length, 2);

  // Sorted by shareOfTotal descending
  assert.equal(groups[0].value, "software_technology");
  assert.equal(groups[0].shareOfTotal, 0.278);

  // Models within category sorted by share descending
  assert.equal(groups[0].models[0].name, "Jev 1.13");
  assert.equal(groups[0].models[0].share, 0.555);
  assert.equal(groups[0].models[1].share, 0.263);

  // Model not in links falls back to slug formatter
  assert.equal(groups[0].models[2].name, "Clef Flash");
  assert.equal(groups[0].models[2].author, "cloudflare");

  assert.equal(groups[1].value, "business_operations");
  assert.equal(groups[1].shareOfTotal, 0.118);
});
