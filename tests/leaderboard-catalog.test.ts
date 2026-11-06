import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeaderboardCatalog } from "@aihot/backend/leaderboard/prices";
import { providerNameOf } from "@aihot/backend/leaderboard/providers";

test("models.dev first-party prices win over OpenRouter third-party relay prices and normalize names", () => {
  const catalog = buildLeaderboardCatalog({
    today: "2026-11-06",
    modelsDev: {
      google: {
        name: "Google",
        doc: "https://ai.google.dev/gemini-api/docs/models",
        models: {
          "gemini-4-argon": {
            name: "Gemini 4 Argon",
            last_updated: "2026-10-13",
            limit: { context: 1_048_576 },
            cost: { input: 2, output: 10, cache_read: 0.1 },
          },
          "gemma-4-31b-it": {
            name: "Gemma 4 31B",
            open_weights: true,
            limit: { context: 131_072 },
          },
        },
      },
      zai: {
        name: "Z.AI",
        doc: "https://docs.z.ai/guides/overview/pricing",
        models: {
          "glm-5.3": {
            name: "GLM-5.3",
            last_updated: "2026-09-20",
            cost: { input: 1.4, output: 4.4, cache_read: 0.26 },
          },
        },
      },
      // Third-party routers or coding plans must be ignored.
      "ollama-cloud": {
        doc: "https://docs.ollama.com/cloud",
        models: {
          "glm-5.3": { name: "GLM-5.3", cost: { input: 0.05, output: 0.2 } },
        },
      },
    },
    openRouter: {
      data: [
        // Cheaper open-weight relay price on OpenRouter must NOT overwrite Z.ai's first-party official price.
        {
          id: "z-ai/glm-5.3",
          name: "Z.ai: GLM 5.3",
          context_length: 200_000,
          pricing: { prompt: "0.0000000699", completion: "0.0000014", input_cache_read: "0.0000000689" },
        },
        // Closed-weight model not yet in models.dev falls back cleanly to OpenRouter.
        {
          id: "openai/gpt-6.1-sol-pro",
          name: "OpenAI: GPT-6.1 Sol Pro",
          context_length: 1_050_000,
          pricing: { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000001" },
        },
        // Open-weight model whose vendor (OpenAI) sells no official API must NOT inherit third-party relay pricing.
        {
          id: "openai/gpt-oss-120b",
          name: "OpenAI: gpt-oss-120b",
          context_length: 131_072,
          pricing: { prompt: "0.000000029", completion: "0.000000108" },
        },
      ],
    },
  });

  const argon = catalog.resolve("gemini-4-argon");
  assert.ok(argon?.exact);
  assert.equal(argon.entry.name, "Gemini 4 Argon");
  assert.deepEqual(argon.entry.provider, { name: "Google", slug: "google" });
  assert.equal(argon.entry.contextWindow, 1_048_576);
  assert.deepEqual(argon.entry.price, {
    currency: "USD",
    input: 2,
    output: 10,
    cached: 0.1,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/models",
    verifiedOn: "2026-10-13",
    note: null,
  });

  const glm = catalog.resolve("glm-5-3");
  assert.ok(glm);
  assert.equal(glm.entry.price?.input, 1.4);
  assert.equal(glm.entry.price?.output, 4.4);
  assert.equal(glm.entry.contextWindow, 200_000, "missing context window in models.dev is filled from OpenRouter");

  const solPro = catalog.resolve("gpt-6-1-sol-pro");
  assert.ok(solPro?.exact);
  assert.equal(solPro.entry.name, "GPT-6.1 Sol Pro");
  assert.equal(solPro.entry.price?.input, 2);
  assert.equal(solPro.entry.price?.output, 10);
  assert.equal(solPro.entry.price?.cached, 0.1);

  // Dated snapshot resolves price/context from base slug without claiming exact name match.
  const dated = catalog.resolve("gemini-4-argon-2026-10-13");
  assert.ok(dated);
  assert.equal(dated.exact, false);
  assert.equal(dated.entry.price?.input, 2);

  // Open-weights models without first-party vendor API resolve to noOfficialApi (null prices + note).
  const gemma = catalog.resolve("gemma-4-31-b-it");
  assert.ok(gemma);
  assert.equal(gemma.entry.price?.input, null);
  assert.equal(gemma.entry.price?.output, null);
  assert.ok(gemma.entry.price?.note);

  const oss = catalog.resolve("gpt-oss-120-b");
  assert.ok(oss);
  assert.equal(oss.entry.price?.input, null);
  assert.equal(oss.entry.price?.output, null);
  assert.ok(oss.entry.price?.note);
});

test("providerNameOf resolves provider display name when stored row says 其他 or only has provider_slug", () => {
  assert.equal(providerNameOf({ name: "gpt-6.1-sol", provider: "其他", provider_slug: "openai" }), "OpenAI");
  assert.equal(providerNameOf({ name: "gemini-4-argon", provider: null, provider_slug: null }), "Google");
  assert.equal(providerNameOf({ name: "CustomX", provider: "其他", provider_slug: "other" }), null);
});
