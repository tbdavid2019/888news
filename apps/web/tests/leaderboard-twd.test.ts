import test from "node:test";
import assert from "node:assert/strict";
import { formatPrice, getPriceValue, listPrice, yuan } from "../app/features/leaderboard/format.ts";
import type { LbPrice } from "@aihot/contracts/leaderboard";

test("formatPrice formats prices in TWD with NT$ prefix and USD with $ prefix", () => {
  // Free / zero price
  assert.equal(formatPrice(0, "TWD"), "免費");
  assert.equal(formatPrice(0, "USD"), "免費");

  // Null or undefined
  assert.equal(formatPrice(null, "TWD"), "—");
  assert.equal(formatPrice(undefined, "USD"), "—");

  // TWD formatting
  assert.equal(formatPrice(31.5, "TWD"), "NT$31.5");
  assert.equal(formatPrice(100, "TWD"), "NT$100");
  assert.equal(formatPrice(0.5, "TWD"), "NT$0.50");
  assert.equal(formatPrice(0.015, "TWD"), "NT$0.015");

  // USD formatting
  assert.equal(formatPrice(1, "USD"), "$1.00");
  assert.equal(formatPrice(2.5, "USD"), "$2.50");
  assert.equal(formatPrice(0.15, "USD"), "$0.15");

  // Legacy yuan() helper formats as TWD to eliminate RMB leakage
  assert.equal(yuan(100), "NT$100");
  assert.equal(yuan(0), "免費");
  assert.ok(!yuan(100).includes("¥"));
  assert.ok(!yuan(100).includes("元"));
});

test("getPriceValue calculates values correctly across TWD and USD", () => {
  const priceData: LbPrice = {
    currency: "USD",
    input: 1.0,
    output: 2.0,
    cached: 0.5,
    inputUsd: 1.0,
    outputUsd: 2.0,
    cachedUsd: 0.5,
    inputTwd: 31.5,
    outputTwd: 63.0,
    cachedTwd: 15.75,
    inputCny: 7.2,
    outputCny: 14.4,
    cachedCny: 3.6,
    officialUrl: null,
    note: null,
  };

  // USD extraction
  assert.equal(getPriceValue(priceData, "input", "USD"), 1.0);
  assert.equal(getPriceValue(priceData, "output", "USD"), 2.0);
  assert.equal(getPriceValue(priceData, "cached", "USD"), 0.5);

  // TWD extraction
  assert.equal(getPriceValue(priceData, "input", "TWD"), 31.5);
  assert.equal(getPriceValue(priceData, "output", "TWD"), 63.0);
  assert.equal(getPriceValue(priceData, "cached", "TWD"), 15.75);

  // Missing price fallback calculation
  const minimalPrice: LbPrice = {
    currency: "USD",
    input: 2.0,
    output: 4.0,
    cached: null,
    inputCny: null,
    outputCny: null,
    cachedCny: null,
    officialUrl: null,
    note: null,
  };
  assert.equal(getPriceValue(minimalPrice, "input", "USD"), 2.0);
  assert.equal(getPriceValue(minimalPrice, "output", "USD"), 4.0);
  assert.equal(getPriceValue(minimalPrice, "cached", "USD"), null);
  assert.equal(getPriceValue(minimalPrice, "input", "TWD"), 63.0);
  assert.equal(getPriceValue(minimalPrice, "output", "TWD"), 126.0);

  // CNY-only source fallback calculation
  const cnyOnlyPrice: LbPrice = {
    currency: "CNY",
    input: 7.2,
    output: 14.4,
    cached: 0,
    inputCny: 7.2,
    outputCny: 14.4,
    cachedCny: 0,
    officialUrl: null,
    note: null,
  };
  assert.equal(getPriceValue(cnyOnlyPrice, "input", "USD"), 1.0);
  assert.equal(getPriceValue(cnyOnlyPrice, "output", "USD"), 2.0);
  assert.equal(getPriceValue(cnyOnlyPrice, "cached", "USD"), 0);
  assert.equal(getPriceValue(cnyOnlyPrice, "input", "TWD"), 31.5);
  assert.equal(getPriceValue(cnyOnlyPrice, "output", "TWD"), 63.0);
  assert.equal(getPriceValue(cnyOnlyPrice, "cached", "TWD"), 0);
});

test("listPrice formats USD properly", () => {
  assert.equal(listPrice(1.5, "USD"), "$1.5");
  assert.equal(listPrice(null, "USD"), "—");
});
