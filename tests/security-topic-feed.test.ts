import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { seedTopics } from "@aihot/backend/publication/topics";
import { buildApp } from "../apps/api/src/app.ts";

const id = tag();
const source = `security-filter-${id}`;
const app = await buildApp();

before(async () => {
  await seedTopics();
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${source}, 'Security filter test', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

async function publish(name: string, tags: string[], selected: boolean) {
  const { articleId } = await upsertMaterial({
    sourceId: source, url: `https://example.com/${id}/${name}`, title: name,
    bodyText: `Test content for ${name}`, bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, tags, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${tags}, ${name}, 'Test summary', ${selected ? 80 : 40}, ${selected})`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}

test("security shows selected items on the home feed and all matching items in the pool", async () => {
  const selected = await publish("selected-security", ["產業動態", "資訊安全"], true);
  const unselected = await publish("unselected-security", ["產業動態", "資訊安全"], false);
  const unrelated = await publish("unrelated", ["產業動態", "Agent"], true);
  const timeline = await app.inject({ method: "GET", url: "/api/site/timeline?topic=infosec" });
  const pool = await app.inject({ method: "GET", url: "/api/site/pool?topic=infosec" });
  assert.equal(timeline.statusCode, 200);
  assert.equal(pool.statusCode, 200);
  const selectedIds = timeline.json().cards.map((card: { item: { id: string } }) => card.item.id);
  const allIds = pool.json().items.map((item: { id: string }) => item.id);
  assert.ok(selectedIds.includes(selected));
  assert.ok(!selectedIds.includes(unselected) && !selectedIds.includes(unrelated));
  assert.ok(allIds.includes(selected) && allIds.includes(unselected));
  assert.ok(!allIds.includes(unrelated));
});
