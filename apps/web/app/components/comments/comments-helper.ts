export interface GarrulEmbedConfig {
  slug: string;
  title: string;
  url: string;
  published?: string;
  api?: string;
  lang?: string;
}

export const DEFAULT_GARRUL_API = "https://garrul.ai360.workers.dev";
export const GARRUL_SCRIPT_ID = "garrul-embed-script";

/**
 * Resolves Garrul widget language:
 * - If explicit lang override is provided, use it
 * - If app locale is 'en', use 'en'
 * - Otherwise default to 'zh-Hant' (Traditional Chinese, reviewed & supported by Garrul)
 */
export function resolveGarrulLang(locale?: string, overrideLang?: string): string {
  if (overrideLang) return overrideLang;
  return locale === "en" ? "en" : "zh-Hant";
}

/**
 * Formats Garrul host element data attributes according to the Garrul embed contract.
 */
export function buildGarrulDataset(config: GarrulEmbedConfig, locale?: string): Record<string, string> {
  const api = (config.api || DEFAULT_GARRUL_API).replace(/\/$/, "");
  const lang = resolveGarrulLang(locale, config.lang);
  const dataset: Record<string, string> = {
    "data-api": api,
    "data-slug": config.slug,
    "data-title": config.title,
    "data-url": config.url,
    "data-lang": lang,
  };
  if (config.published) {
    dataset["data-published"] = config.published;
  }
  return dataset;
}
