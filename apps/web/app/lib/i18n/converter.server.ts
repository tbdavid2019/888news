import * as OpenCC from "opencc-js";
import type { Locale } from "./types.ts";


let converterTw: ((text: string) => string) | null = null;

function getTwConverter() {
  if (!converterTw) {
    converterTw = OpenCC.Converter({ from: "cn", to: "twp" });
  }
  return converterTw;
}

const HAS_ZH = /[\u4e00-\u9fa5]/;

export function toTraditional(text: string): string {
  if (!text || !HAS_ZH.test(text)) return text;
  return getTwConverter()(text);
}

export function localizeData<T>(data: T, locale: Locale): T {
  if (locale !== "zh-TW" || data === null || data === undefined) return data;

  const cv = getTwConverter();

  function convert(item: any, key?: string): any {
    if (typeof item === "string") {
      if (!HAS_ZH.test(item)) return item;
      // Skip IDs, URLs, ISO dates, hashes, slugs, keys
      if (
        key &&
        (key.endsWith("Id") ||
          key.endsWith("Url") ||
          key.endsWith("At") ||
          key === "id" ||
          key === "url" ||
          key === "href" ||
          key === "slug" ||
          key === "key" ||
          key === "hash" ||
          key === "model" ||
          key === "cursor" ||
          key === "code" ||
          key === "color")
      ) {
        return item;
      }
      return cv(item);
    }
    if (Array.isArray(item)) {
      return item.map((sub) => convert(sub, key));
    }
    if (item && typeof item === "object") {
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        res[k] = convert(v, k);
      }
      return res;
    }
    return item;
  }

  return convert(data);
}
