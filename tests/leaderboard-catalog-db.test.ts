import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { importOfficialPrices, syncLeaderboardCatalog } from "@aihot/backend/leaderboard/prices";

after(closeDb);

test("syncLeaderboardCatalog fills missing prices, normalizes raw model names/providers, and preserves curated seeds", async () => {
  const suffix = tag();
  const dynamicId = `dyn-${suffix}`;
  const dynamicSlug = `gemini-test-${suffix}`;
  const seededId = `seed-${suffix}`;

  await sql`INSERT INTO lb_models (id, slug, name, provider, provider_slug, metadata_source) VALUES
    (${dynamicId}, ${dynamicSlug}, ${dynamicSlug}, '其他', 'other', 'epoch-gpqa')`;
  await sql`INSERT INTO lb_models (id, slug, name, provider, provider_slug, metadata_source) VALUES
    (${seededId}, 'gpt-6-astra', 'GPT-6 Astra', 'OpenAI', 'openai', 'directory')
    ON CONFLICT (slug) DO NOTHING`;

  await importOfficialPrices({ overwrite: true });

  const res = await syncLeaderboardCatalog({
    today: "2026-11-06",
    modelsDev: {
      google: {
        name: "Google",
        doc: "https://ai.google.dev/gemini-api/docs/models",
        models: {
          [dynamicSlug]: {
            name: `Gemini Test ${suffix.toUpperCase()}`,
            last_updated: "2026-11-01",
            limit: { context: 1_048_576 },
            cost: { input: 2, output: 10, cache_read: 0.1 },
          },
        },
      },
      openai: {
        name: "OpenAI",
        doc: "https://platform.openai.com/docs/models",
        models: {
          // Even if upstream had a different number, curated seed entry for gpt-6-astra must remain untouched.
          "gpt-6-astra": {
            name: "GPT-6 Astra",
            cost: { input: 999, output: 999, cache_read: 99 },
          },
        },
      },
    },
    openRouter: { data: [] },
  });

  assert.ok(res.pricesWritten >= 1);
  assert.ok(res.modelsUpdated >= 1);

  const [updatedModel] = await sql<{ name: string; provider: string; provider_slug: string; context_window_tokens: number }[]>`
    SELECT name, provider, provider_slug, context_window_tokens FROM lb_models WHERE id = ${dynamicId}`;
  assert.deepEqual(updatedModel, {
    name: `Gemini Test ${suffix.toUpperCase()}`,
    provider: "Google",
    provider_slug: "google",
    context_window_tokens: 1_048_576,
  });

  const [syncedPrice] = await sql<{ currency: string; input: string; output: string; cached_input: string }[]>`
    SELECT currency, input, output, cached_input FROM lb_prices WHERE model_id = ${dynamicId} AND kind = 'official'`;
  assert.equal(syncedPrice?.currency, "USD");
  assert.equal(Number(syncedPrice?.input), 2);
  assert.equal(Number(syncedPrice?.output), 10);
  assert.equal(Number(syncedPrice?.cached_input), 0.1);

  const [astraModel] = await sql<{ id: string }[]>`SELECT id FROM lb_models WHERE slug = 'gpt-6-astra'`;
  const [astraPrice] = await sql<{ input: string; output: string }[]>`
    SELECT input, output FROM lb_prices WHERE model_id = ${astraModel!.id} AND kind = 'official'`;
  assert.equal(Number(astraPrice?.input), 10, "curated local seed price is never overwritten by upstream catalog");
  assert.equal(Number(astraPrice?.output), 50);

  // Idempotent second run writes zero rows when nothing changed.
  const second = await syncLeaderboardCatalog({
    today: "2026-11-06",
    modelsDev: {
      google: {
        name: "Google",
        doc: "https://ai.google.dev/gemini-api/docs/models",
        models: {
          [dynamicSlug]: {
            name: `Gemini Test ${suffix.toUpperCase()}`,
            last_updated: "2026-11-01",
            limit: { context: 1_048_576 },
            cost: { input: 2, output: 10, cache_read: 0.1 },
          },
        },
      },
    },
    openRouter: { data: [] },
  });
  assert.equal(second.pricesWritten, 0);
  assert.equal(second.modelsUpdated, 0);
});
