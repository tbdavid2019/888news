// Page metadata from one place: title template, canonical address, OG images, robots. The site's name
// and wording come from the industry pack (industry/site.ts); its address from SITE_URL.
import type { MetaDescriptor } from "react-router";
import { SITE } from "@aihot/industry/site";
import type { Locale } from "./i18n/types.ts";
import { zhTW } from "./i18n/locales/zh-TW.ts";
import { zhCN } from "./i18n/locales/zh-CN.ts";
import { en } from "./i18n/locales/en.ts";

/**
 * The site's address: SITE_URL while rendering on the server (what crawlers and share previews read),
 * the page's own origin in the browser.
 */
export function siteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.SITE_URL || SITE.defaultUrl).replace(/\/+$/, "");
}

export const HOME_TITLE = SITE.homeTitle;
export const SITE_DESCRIPTION = SITE.description;

export interface LocalizedSiteMeta {
  title: string;
  tagline: string;
  description: string;
  ogLocale: string;
}

export function getLocalizedSiteMeta(locale?: string | null): LocalizedSiteMeta {
  if (locale === "en") {
    return {
      title: en["site.title"],
      tagline: en["site.tagline"],
      description: en["site.description"],
      ogLocale: "en_US",
    };
  }
  if (locale === "zh-CN") {
    return {
      title: zhCN["site.title"],
      tagline: zhCN["site.tagline"],
      description: zhCN["site.description"],
      ogLocale: "zh_CN",
    };
  }
  return {
    title: zhTW["site.title"] || SITE.homeTitle,
    tagline: zhTW["site.tagline"] || SITE.tagline,
    description: zhTW["site.description"] || SITE.description,
    ogLocale: "zh_TW",
  };
}

export interface PageMetaInput {
  title?: string | null;
  /** Use `title` verbatim as the document title (no " · <site>" suffix). */
  rawTitle?: boolean;
  description?: string | null;
  path: string;
  image?: string | null;
  noindex?: boolean;
  nofollow?: boolean;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  locale?: Locale | null;
  matches?: Array<{ id?: string; loaderData?: unknown; data?: unknown } | undefined> | unknown;
}

export function resolveLocale(input: PageMetaInput): Locale {
  if (input.locale) return input.locale;
  if (Array.isArray(input.matches)) {
    const rootMatch = (input.matches as Array<{ id?: string; loaderData?: unknown; data?: unknown } | undefined>).find(
      (m) => m?.id === "root"
    );
    const rootData = (rootMatch?.loaderData ?? rootMatch?.data) as { locale?: Locale } | undefined;
    if (rootData?.locale) return rootData.locale;
  }
  if (typeof document !== "undefined" && document.documentElement.lang) {
    const lang = document.documentElement.lang;
    if (lang === "en" || lang === "zh-CN" || lang === "zh-TW") return lang;
  }
  return "zh-TW";
}

/**
 * A list page's own address (canonical, og:url) from the filters it applied: tracking and unknown
 * parameters (`?from=timeline`, `utm_*`) never become part of it. The page caches keep one copy across
 * such parameters, so the address in that copy must not depend on them either.
 */
export function listPath(path: string, params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** "Title · Site". */
export function titled(title: string): string {
  return `${title} · ${SITE.name}`;
}

export function pageMeta(input: PageMetaInput): MetaDescriptor[] {
  const base = siteUrl();
  const loc = resolveLocale(input);
  const site = getLocalizedSiteMeta(loc);
  const homeTitle = site.title;
  const siteDescription = site.description;

  const title = input.title ? (input.rawTitle ? input.title : titled(input.title)) : homeTitle;
  const description = input.description ?? siteDescription;
  const url = `${base}${input.path}`;
  const image = input.image ? (input.image.startsWith("http") ? input.image : `${base}${input.image}`) : `${base}/og/site.png`;
  const imageAlt = input.title ? `${input.title} - ${SITE.name}` : `${SITE.name} — ${site.tagline}`;
  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE.name },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:title", content: input.title ?? homeTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: imageAlt },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:locale", content: site.ogLocale },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@888news" },
    { name: "twitter:creator", content: "@888news" },
    { name: "twitter:title", content: input.title ?? homeTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: imageAlt },
  ];
  if (input.noindex) tags.push({ name: "robots", content: input.nofollow ? "noindex, nofollow" : "noindex, follow" });
  if (input.jsonLd) tags.push({ "script:ld+json": input.jsonLd });
  return tags;
}

export function organizationLd() {
  const base = siteUrl();
  const founder = SITE.organization.founder;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.organization.name,
    url: base,
    logo: `${base}/icon.png`,
    ...(founder ? { founder: { "@type": "Person", name: founder.name, ...(founder.description ? { description: founder.description } : {}), ...(founder.url ? { sameAs: [founder.url] } : {}) } } : {}),
  };
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${base}${it.path}` })),
  };
}
