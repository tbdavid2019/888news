// Links in the site's own copy (terms, privacy): the site's own address stays on the site, whatever
// domain it is deployed at; any other address opens in a new tab.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown, renderTablesInHtml } from "../app/lib/markdown.ts";

const SITE = "https://news.example.com";
const link = (md: string) => /<a [^>]*>/.exec(renderMarkdown(md, SITE).html)?.[0];

test("a link to the site's own address becomes an in-site path", () => {
  assert.equal(link("[关于](https://news.example.com/about)"), '<a href="/about">');
  assert.equal(link("[首页](https://news.example.com)"), '<a href="/">');
  assert.equal(link("[隐私](/privacy)"), '<a href="/privacy">');
});

test("any other address opens in a new tab", () => {
  assert.equal(link("[AIHOT](https://aihot.news/about)"), '<a href="https://aihot.news/about" target="_blank" rel="noopener noreferrer">');
  assert.equal(link("[别的站](https://news.example.com.evil.test/about)"), '<a href="https://news.example.com.evil.test/about" target="_blank" rel="noopener noreferrer">');
});

test("renderMarkdown renders markdown table into semantic HTML table", () => {
  const md = `| 層級 | Kumar 舉的例子 | Contour 的作法 |
|---|---|---|
| 零散資料/訪談供應商 | AlphaSense、Yipit | 保留訂閱 |
| 整套 AI 研究平臺 | Rogo、Hebbia | 自建對應平臺 |`;

  const rendered = renderMarkdown(md, SITE).html;
  assert.match(rendered, /^<table><thead><tr><th>層級<\/th><th>Kumar 舉的例子<\/th><th>Contour 的作法<\/th><\/tr><\/thead>/);
  assert.match(rendered, /<tbody><tr><td>零散資料\/訪談供應商<\/td><td>AlphaSense、Yipit<\/td><td>保留訂閱<\/td><\/tr>/);
});

test("renderTablesInHtml converts unparsed markdown tables in HTML paragraph into table elements", () => {
  const sample = `<p>他把同樣的邏輯延伸到供應商組合。</p><p>| 層級 | Kumar 舉的例子 | Contour 的作法 |<br>|---|---|---|<br>| 零散資料／訪談供應商 | AlphaSense、Yipit | 保留訂閱，透過 MCP／API 拉進內部代理 |<br>| 整套 AI 研究平台 | Rogo、Hebbia | 自建對應平台，依每位分析師調校 |<br>| 內部平台 | Contour 自建 | 持續從分析師習慣與模型更新中學習 |</p><h3>下一個章節</h3>`;

  const output = renderTablesInHtml(sample);
  assert.ok(!output.includes("<p>| 層級"), "Raw table text should not remain in p tag");
  assert.match(output, /<table><thead><tr><th>層級<\/th><th>Kumar 舉的例子<\/th><th>Contour 的作法<\/th><\/tr><\/thead>/);
  assert.match(output, /<tbody><tr><td>零散資料／訪談供應商<\/td><td>AlphaSense、Yipit<\/td>/);
  assert.match(output, /<td>持續從分析師習慣與模型更新中學習<\/td><\/tr><\/tbody><\/table>/);
  assert.match(output, /<h3>下一個章節<\/h3>/);
});

test("renderTablesInHtml preserves surrounding text before and after table in same paragraph", () => {
  const mixed = `<p>前言介紹文字<br>| 標題A | 標題B |<br>|---|---|<br>| 項目1 | 項目2 |<br>結尾說明文字</p>`;
  const output = renderTablesInHtml(mixed);
  assert.match(output, /^<p>前言介紹文字<\/p><table><thead><tr><th>標題A<\/th><th>標題B<\/th><\/tr><\/thead><tbody><tr><td>項目1<\/td><td>項目2<\/td><\/tr><\/tbody><\/table><p>結尾說明文字<\/p>$/);
});

test("renderTablesInHtml does not alter normal paragraphs that happen to contain pipe symbols", () => {
  const normal = `<p>OpenAI | Anthropic | Google | Meta 是主要模型提供商</p>`;
  assert.equal(renderTablesInHtml(normal), normal);
});

test("renderTablesInHtml formats inline styles inside table cells", () => {
  const tableWithStyles = `<p>| 功能 | 說明 |<br>|---|---|<br>| **粗體項目** | \`code_snippet\` |</p>`;
  const output = renderTablesInHtml(tableWithStyles);
  assert.match(output, /<th>功能<\/th><th>說明<\/th>/);
  assert.match(output, /<td><strong>粗體項目<\/strong><\/td><td><code>code_snippet<\/code><\/td>/);
});

test("renderTablesInHtml preserves escaped pipes and code spans with pipes", () => {
  const table = `<p>| Command | Output |<br>|---|---|<br>| \`ls | grep\` | val1 \\| val2 |</p>`;
  const output = renderTablesInHtml(table);
  assert.match(output, /<td><code>ls \| grep<\/code><\/td>/);
  assert.match(output, /<td>val1 \| val2<\/td>/);
});

test("renderTablesInHtml does not swallow preceding prose with pipes into header", () => {
  const mixed = `<p>Use A | B syntax here<br>| Header 1 | Header 2 |<br>|---|---|<br>| D1 | D2 |</p>`;
  const output = renderTablesInHtml(mixed);
  assert.match(output, /^<p>Use A \| B syntax here<\/p><table><thead><tr><th>Header 1<\/th><th>Header 2<\/th><\/tr><\/thead>/);
});

test("renderTablesInHtml defends against attribute injection in markdown links", () => {
  const table = `<p>| Site |<br>|---|<br>| [click](https://example.com/"onmouseover="alert(1)) |</p>`;
  const output = renderTablesInHtml(table);
  // Quotes cannot break out of href attribute
  assert.ok(!output.includes('onmouseover="alert(1)'));
});

test("renderTablesInHtml preserves column alignments from delimiter row", () => {
  const table = `<p>| Left | Center | Right |<br>|:---|:---:|---:|<br>| L | C | R |</p>`;
  const output = renderTablesInHtml(table);
  assert.match(output, /<th align="left">Left<\/th><th align="center">Center<\/th><th align="right">Right<\/th>/);
  assert.match(output, /<td align="left">L<\/td><td align="center">C<\/td><td align="right">R<\/td>/);
});

test("renderTablesInHtml preserves existing safe HTML tags in legacy cells without double escaping", () => {
  const legacy = `<p>| Company | Info |<br>|---|---|<br>| AT&amp;T | <strong>Core</strong> &amp; <a href="https://example.com/">Link</a> |</p>`;
  const output = renderTablesInHtml(legacy);
  assert.match(output, /<td>AT&amp;T<\/td>/);
  assert.match(output, /<strong>Core<\/strong>/);
  assert.match(output, /<a href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer">Link<\/a>/);
  assert.ok(!output.includes("&amp;amp;"));
  assert.ok(!output.includes("&lt;strong&gt;"));
});

test("renderTablesInHtml does not swallow trailing prose with pipes into table body", () => {
  const tableWithTrailing = `<p>| H1 | H2 |<br>|---|---|<br>| D1 | D2 |<br>Syntax: A | B is supported</p>`;
  const output = renderTablesInHtml(tableWithTrailing);
  assert.match(output, /<table>.*<\/table><p>Syntax: A \| B is supported<\/p>/);
  assert.ok(!output.includes("<td>Syntax: A"));
});
