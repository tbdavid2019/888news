import assert from "node:assert/strict";
import { test } from "node:test";
import { isMermaidCode, cleanMermaidSource } from "../app/lib/use-mermaid.ts";

test("isMermaidCode correctly detects standard Mermaid diagrams without language class", () => {
  const userCase = `flowchart TD
    A["外部訊號：email、電話、保管機構事件、市場波動"] --> C["訊號系統路由給關注的代理"]
    B["內部訊號：UI 編輯、改期事件、完成的任務"] --> C
    C --> D["背景代理：配備機制、工具、護欄、持久記憶"]`;
  assert.equal(isMermaidCode(userCase), true);

  assert.equal(isMermaidCode("sequenceDiagram\nAlice->>John: Hello John"), true);
  assert.equal(isMermaidCode("graph LR\n  A --> B"), true);
  assert.equal(isMermaidCode("graph TD\n  A --> B"), true);
  assert.equal(isMermaidCode("classDiagram\n  Animal <|-- Duck"), true);
  assert.equal(isMermaidCode("stateDiagram-v2\n  [*] --> Still"), true);
  assert.equal(isMermaidCode("erDiagram\n  CUSTOMER ||--o{ ORDER : places"), true);
  assert.equal(isMermaidCode("gantt\n  dateFormat YYYY-MM-DD"), true);
  assert.equal(isMermaidCode("pie title Pets\n  \"Dogs\" : 386"), true);
  assert.equal(isMermaidCode("gitGraph\n  commit"), true);
  assert.equal(isMermaidCode("mindmap\n  root((mindmap))"), true);
  assert.equal(isMermaidCode("architecture-beta\n  group api(cloud)[API]"), true);
});

test("isMermaidCode correctly handles frontmatter and leading comments", () => {
  const withFrontmatter = `---
title: System Architecture
---
flowchart LR
    Client --> Server`;
  assert.equal(isMermaidCode(withFrontmatter), true);

  const withComments = `%% Diagram of dataflow
%% Another comment
flowchart TD
    A --> B`;
  assert.equal(isMermaidCode(withComments), true);
});

test("isMermaidCode correctly respects language classes", () => {
  assert.equal(isMermaidCode("some arbitrary text", ["language-mermaid"]), true);
  assert.equal(isMermaidCode("some arbitrary text", ["mermaid"]), true);

  // If another language is explicitly defined, do not misclassify even if keyword appears
  assert.equal(isMermaidCode("graph = nx.Graph()", ["language-python"]), false);
  assert.equal(isMermaidCode("const pie = 3.14;", ["language-javascript"]), false);
});

test("isMermaidCode does not false-positive on regular code snippets", () => {
  assert.equal(isMermaidCode("const x = 10;\nfunction test() {}"), false);
  assert.equal(isMermaidCode("SELECT * FROM publications WHERE id = 1"), false);
  assert.equal(isMermaidCode("import React from 'react';"), false);
  assert.equal(isMermaidCode("def hello():\n    return 'world'"), false);
  // Bare graph without direction is not mermaid
  assert.equal(isMermaidCode("graph = build_graph()"), false);
});
