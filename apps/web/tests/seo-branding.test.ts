import test from "node:test";
import assert from "node:assert/strict";
import { getLocalizedSiteMeta, pageMeta } from "../app/lib/seo.ts";
import { SITE } from "@aihot/industry/site";
import { zhTW } from "../app/lib/i18n/locales/zh-TW.ts";
import { en } from "../app/lib/i18n/locales/en.ts";
import { zhCN } from "../app/lib/i18n/locales/zh-CN.ts";

test("site branding and titles do not contain AI buzzwords in default titles", () => {
  assert.equal(SITE.homeTitle, "888news - 資訊圈的日報週報月報");
  assert.equal(SITE.tagline, "資訊圈的日報週報月報");
  assert.ok(!SITE.homeTitle.includes("AI"));
  assert.ok(!SITE.tagline.includes("AI"));
});

test("localized site meta generates correct titles for zh-TW, zh-CN, and en", () => {
  const tw = getLocalizedSiteMeta("zh-TW");
  assert.equal(tw.title, "888news - 資訊圈的日報週報月報");
  assert.equal(tw.tagline, "資訊圈的日報週報月報");
  assert.equal(tw.ogLocale, "zh_TW");
  assert.ok(!tw.title.includes("AI"));

  const cn = getLocalizedSiteMeta("zh-CN");
  assert.equal(cn.title, "888news - 资讯圈的日报周报月报");
  assert.equal(cn.tagline, "资讯圈的日报周报月报");
  assert.equal(cn.ogLocale, "zh_CN");
  assert.ok(!cn.title.includes("AI"));

  const eng = getLocalizedSiteMeta("en");
  assert.equal(eng.title, "888news - Tech World's Daily, Weekly & Monthly Brief");
  assert.equal(eng.tagline, "Daily, Weekly & Monthly Tech Intelligence");
  assert.equal(eng.ogLocale, "en_US");
  assert.ok(!eng.title.includes("AI"));
});

test("pageMeta adapts home page title based on locale", () => {
  const metaTW = pageMeta({ path: "/", locale: "zh-TW" });
  const titleTW = metaTW.find((t): t is { title: string } => "title" in t)?.title;
  assert.equal(titleTW, "888news - 資訊圈的日報週報月報");

  const metaEN = pageMeta({ path: "/", locale: "en" });
  const titleEN = metaEN.find((t): t is { title: string } => "title" in t)?.title;
  assert.equal(titleEN, "888news - Tech World's Daily, Weekly & Monthly Brief");

  const metaCN = pageMeta({ path: "/", locale: "zh-CN" });
  const titleCN = metaCN.find((t): t is { title: string } => "title" in t)?.title;
  assert.equal(titleCN, "888news - 资讯圈的日报周报月报");
});

test("pageMeta adapts home page title from route matches", () => {
  const fakeMatches = [
    { id: "root", loaderData: { locale: "en" as const, changelogVersion: null } },
  ];
  const meta = pageMeta({ path: "/", matches: fakeMatches });
  const title = meta.find((t): t is { title: string } => "title" in t)?.title;
  assert.equal(title, "888news - Tech World's Daily, Weekly & Monthly Brief");

  const ogLocale = meta.find((t): t is { property: string; content: string } => "property" in t && t.property === "og:locale")?.content;
  assert.equal(ogLocale, "en_US");

  const ogImageAlt = meta.find((t): t is { property: string; content: string } => "property" in t && t.property === "og:image:alt")?.content;
  assert.equal(ogImageAlt, "888news — Daily, Weekly & Monthly Tech Intelligence");
});

test("subroutes correctly propagate locale and og:locale from matches", () => {
  const fakeMatches = [
    { id: "root", loaderData: { locale: "en" as const, changelogVersion: null } },
  ];
  const meta = pageMeta({ path: "/hot", title: "Trending", matches: fakeMatches });
  const title = meta.find((t): t is { title: string } => "title" in t)?.title;
  assert.equal(title, "Trending · 888news");

  const ogLocale = meta.find((t): t is { property: string; content: string } => "property" in t && t.property === "og:locale")?.content;
  assert.equal(ogLocale, "en_US");
});
