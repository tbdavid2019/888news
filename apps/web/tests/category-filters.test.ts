import assert from "node:assert/strict";
import test from "node:test";
import { SITE } from "@aihot/industry/site";
import { categoryFilters } from "../app/features/feed/category-filters.ts";

test("the security filter belongs to both feed rows and clears competing filters", () => {
  for (const base of ["/", "/all"]) {
    const current = new URLSearchParams("category=paper&channel=firstParty&tag=Agent&page=3&cursor=old&q=漏洞");
    const tabs = categoryFilters(base, current, "paper", "firstParty", SITE.homeTopicShortcut);
    assert.deepEqual(tabs.items.slice(0, 4).map((item) => item.key), ["all", "firstParty", "topic", "ai-models"]);
    const security = new URL(tabs.items[2]!.to, "http://localhost");
    assert.equal(security.pathname, base);
    assert.equal(security.searchParams.get("topic"), "infosec");
    assert.equal(security.searchParams.get("q"), "漏洞");
    for (const key of ["category", "channel", "tag", "page", "cursor"]) assert.equal(security.searchParams.get(key), null);

    const selected = categoryFilters(base, security.searchParams, null, "all", SITE.homeTopicShortcut);
    assert.equal(selected.active, "topic");
    const all = new URL(selected.items[0]!.to, "http://localhost");
    assert.equal(all.searchParams.get("topic"), null);
    assert.equal(all.searchParams.get("q"), "漏洞");
    const model = new URL(selected.items.find((item) => item.key === "ai-models")!.to, "http://localhost");
    assert.equal(model.searchParams.get("topic"), null);
    assert.equal(model.searchParams.get("category"), "ai-models");
  }
});

test("the optional topic filter follows the configured slug and can be disabled", () => {
  const params = new URLSearchParams("topic=systems");
  const configured = categoryFilters("/all", params, null, "all", { slug: "systems" });
  assert.equal(configured.active, "topic");
  assert.equal(new URL(configured.items[2]!.to, "http://localhost").searchParams.get("topic"), "systems");
  assert.equal(categoryFilters("/all", params, null, "all", null).items.some((item) => item.key === "topic"), false);
});

test("switching ordinary categories preserves an existing tag context", () => {
  const tabs = categoryFilters("/all", new URLSearchParams("tag=Agent"), null, "all", SITE.homeTopicShortcut);
  const model = new URL(tabs.items.find((item) => item.key === "ai-models")!.to, "http://localhost");
  assert.equal(model.searchParams.get("tag"), "Agent");
  assert.equal(model.searchParams.get("category"), "ai-models");
});
