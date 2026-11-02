import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_GARRUL_API,
  GARRUL_SCRIPT_ID,
  buildGarrulDataset,
  resolveGarrulLang,
} from "../app/components/comments/comments-helper.ts";

test("resolveGarrulLang correctly maps locales", () => {
  assert.equal(resolveGarrulLang(undefined), "zh-Hant", "Defaults to zh-Hant");
  assert.equal(resolveGarrulLang("zh-TW"), "zh-Hant", "Maps zh-TW to zh-Hant");
  assert.equal(resolveGarrulLang("zh-CN"), "zh-Hant", "Maps zh-CN to zh-Hant");
  assert.equal(resolveGarrulLang("en"), "en", "Maps en to en");
  assert.equal(resolveGarrulLang("zh-TW", "ja"), "ja", "Explicit override wins over locale");
});

test("buildGarrulDataset formats required attributes for Garrul embed", () => {
  const dataset = buildGarrulDataset({
    slug: "news:test-123",
    title: "Test News Title",
    url: "https://news2.david888.com/items/test-123",
  });

  assert.equal(dataset["data-api"], DEFAULT_GARRUL_API);
  assert.equal(dataset["data-slug"], "news:test-123");
  assert.equal(dataset["data-title"], "Test News Title");
  assert.equal(dataset["data-url"], "https://news2.david888.com/items/test-123");
  assert.equal(dataset["data-lang"], "zh-Hant");
  assert.equal(dataset["data-published"], undefined);
});

test("buildGarrulDataset supports optional published date and custom api origin", () => {
  const publishedIso = "2026-11-01T08:30:00.000Z";
  const customApi = "https://comments.custom.org/";
  const dataset = buildGarrulDataset(
    {
      slug: "story:event-456",
      title: "Major Story",
      url: "https://news2.david888.com/story/event-456",
      published: publishedIso,
      api: customApi,
      lang: "en",
    },
    "zh-TW"
  );

  assert.equal(dataset["data-api"], "https://comments.custom.org");
  assert.equal(dataset["data-slug"], "story:event-456");
  assert.equal(dataset["data-title"], "Major Story");
  assert.equal(dataset["data-url"], "https://news2.david888.com/story/event-456");
  assert.equal(dataset["data-published"], publishedIso);
  assert.equal(dataset["data-lang"], "en");
});

test("GARRUL_SCRIPT_ID is stable and unique", () => {
  assert.equal(GARRUL_SCRIPT_ID, "garrul-embed-script");
});
