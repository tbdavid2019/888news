import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTaiwanTerms } from "@aihot/backend/editorial/taiwan-terms";
import { promptText } from "@aihot/backend/editorial/prompts";

describe("Taiwan Terminology Guard (normalizeTaiwanTerms)", () => {
  it("normalizes aerospace terms from Mainland Chinese to Taiwan zh-TW", () => {
    const input = "SpaceX 成功以發射臺捕獲 Starship 上面級，助推器與有效載荷表現穩定，航天局表示宇航員將搭航天器升空。";
    const out = normalizeTaiwanTerms(input);
    assert.equal(
      out,
      "SpaceX 成功以發射台捕獲 Starship 上級火箭，推進器與有效酬載表現穩定，太空總署表示太空人將搭太空船升空。",
    );
  });

  it("normalizes tech, AI, hardware, and IT terms", () => {
    const input = "這款人工智能大語言模型運行於最新半導體芯片與服務器，優化了數據庫查詢算法、網絡帶寬與內存使用，程序員在博客分享視頻與代碼。";
    const out = normalizeTaiwanTerms(input);
    assert.equal(
      out,
      "這款人工智慧大型語言模型運行於最新半導體晶片與伺服器，優化了資料庫查詢演算法、網路頻寬與記憶體使用，工程師在部落格分享影片與程式碼。",
    );
  });

  it("avoids false positives on valid Taiwanese phrases", () => {
    assert.equal(normalizeTaiwanTerms("實測數據顯示模型表示支持董事會決議"), "實測數據顯示模型表示支持董事會決議");
    assert.equal(normalizeTaiwanTerms("昆蟲透過信息素溝通，並保護用戶信息安全"), "昆蟲透過信息素溝通，並保護用戶資訊安全");
  });

  it("protects inline code, fenced code blocks, and URLs from modification", () => {
    const input = [
      "查看 https://example.com/上面級/数据库 與 `const 数据库 = '上面級'`，正文裡的數據庫和上面級要轉。",
      "",
      "```ts",
      "const 服務器 = '上面級';",
      "```",
    ].join("\n");
    const out = normalizeTaiwanTerms(input);
    assert.ok(out.includes("https://example.com/上面級/数据库"), "URL untouched");
    assert.ok(out.includes("`const 数据库 = '上面級'`"), "inline code untouched");
    assert.ok(out.includes("const 服務器 = '上面級';"), "fenced code block untouched");
    assert.ok(out.includes("正文裡的資料庫和上級火箭要轉。"), "prose normalized");
  });
});

describe("Reader-Facing Prompts Include Taiwan Terminology Rules", () => {
  const sampleValues: Record<string, Record<string, string>> = {
    "story-digest": {},
    "translate-body": {},
    "translate-post": {},
    "report-daily-lead": {},
    "report-period": { kindName: "週報", overviewLength: "150–300" },
    "podcast-understand": {},
    understand: {},
    "summarize-article": {
      publishedDate: "2026-11-16",
      today: "2026-11-16",
      sourceName: "Test",
      identity: "",
      title: "Test",
      body: "Test body",
    },
    "summarize-long-post": { sourceName: "Test", identity: "", post: "Test" },
    "summarize-short-post": { sourceName: "Test", identity: "", post: "Test" },
  };

  for (const [name, vars] of Object.entries(sampleValues)) {
    it(`prompt "${name}" expands rules-taiwan-zh cleanly`, () => {
      const rendered = promptText(name, vars);
      assert.ok(rendered.includes("台灣正體中文"), `${name} should enforce 台灣正體中文`);
      assert.ok(rendered.includes("上級火箭"), `${name} should include 上級火箭 guidance`);
    });
  }
});
