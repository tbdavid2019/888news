import type { Locale } from "./types.ts";


export function parseCookieLocale(cookieHeader?: string | null): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)site_locale=([^;]+)/);
  if (match) {
    const val = decodeURIComponent(match[1]!).trim();
    if (val === "zh-TW" || val === "zh-CN" || val === "en") return val;
  }
  return null;
}

export function parseAcceptLanguage(header?: string | null): Locale {
  if (!header || !header.trim()) return "en";

  const parts = header.toLowerCase().split(",").map((part) => {
    const [tag, qPart] = part.split(";");
    const q = qPart ? parseFloat(qPart.replace("q=", "").trim()) : 1.0;
    return { tag: tag?.trim() || "", q: isNaN(q) ? 1.0 : q };
  }).sort((a, b) => b.q - a.q);

  for (const { tag } of parts) {
    if (
      tag.startsWith("zh-tw") ||
      tag.startsWith("zh-hk") ||
      tag.startsWith("zh-mo") ||
      tag.includes("hant")
    ) {
      return "zh-TW";
    }
    if (
      tag.startsWith("zh-cn") ||
      tag.startsWith("zh-sg") ||
      tag.includes("hans")
    ) {
      return "zh-CN";
    }
    if (tag === "zh") {
      return "zh-TW";
    }
    if (tag.startsWith("en")) {
      return "en";
    }
  }

  // Not Chinese / unknown -> default to English
  return "en";
}

export function detectLocale(request?: Request): Locale {
  if (typeof window === "undefined") {
    // Server-side
    const cookie = request?.headers.get("cookie");
    const cookieLocale = parseCookieLocale(cookie);
    if (cookieLocale) return cookieLocale;

    const acceptLang = request?.headers.get("accept-language");
    return parseAcceptLanguage(acceptLang);
  } else {
    // Client-side
    const cookieLocale = parseCookieLocale(document.cookie);
    if (cookieLocale) return cookieLocale;

    const stored = localStorage.getItem("site_locale") as Locale | null;
    if (stored === "zh-TW" || stored === "zh-CN" || stored === "en") return stored;

    const navLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || "";
    return parseAcceptLanguage(navLang);
  }
}
