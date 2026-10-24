import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPodcastChannels, loadPodcastRecommend, loadPodcastTickers } from "@aihot/backend/publication/podcast";
import { bridgePodcastsToPublications } from "@aihot/backend/publication/podcast-bridge";
import { associateEntitiesAndTickers, convertMarkdownToHtml, syncBigGoPodcastEpisodes, syncPodcastFeeds } from "@aihot/backend/sources/podcast-sync";

test("publication layer exports loadPodcastChannels, loadPodcastRecommend, and loadPodcastTickers functions", () => {
  assert.equal(typeof loadPodcastChannels, "function");
  assert.equal(typeof loadPodcastRecommend, "function");
  assert.equal(typeof loadPodcastTickers, "function");
  assert.equal(typeof bridgePodcastsToPublications, "function");
  assert.equal(typeof syncPodcastFeeds, "function");
  assert.equal(typeof syncBigGoPodcastEpisodes, "function");
  assert.equal(typeof associateEntitiesAndTickers, "function");
});

test("convertMarkdownToHtml correctly converts markdown tables to HTML table elements", () => {
  const md = `
Kumar 舉的例子說明：

| 層級 | Kumar 舉的例子 | Contour 的作法 |
|---|---|---|
| 零散資料／訪談供應商 | AlphaSense、Yipit | 保留訂閱，透過 MCP／API 拉進內部代理 |
| 整套 AI 研究平台 | Rogo、Hebbia | 自建對應平台，依每位分析師調校 |
| 內部平台 | Contour 自建 | 持續從分析師習慣與模型更新中學習 |
`;

  const html = convertMarkdownToHtml(md);
  assert.match(html, /<p>Kumar 舉的例子說明：<\/p>/);
  assert.match(html, /<table><thead><tr><th>層級<\/th><th>Kumar 舉的例子<\/th><th>Contour 的作法<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>零散資料／訪談供應商<\/td><td>AlphaSense、Yipit<\/td>/);
  assert.match(html, /<td>持續從分析師習慣與模型更新中學習<\/td><\/tr><\/tbody><\/table>/);
});

test("convertMarkdownToHtml handles escaped pipes and code spans with pipes", () => {
  const md = `
| Tool | Syntax | Example |
|---|---|---|
| Grep | \`cat | grep\` | a \\| b |
`;
  const html = convertMarkdownToHtml(md);
  assert.match(html, /<td><code>cat \| grep<\/code><\/td>/);
  assert.match(html, /<td>a \| b<\/td>/);
});
