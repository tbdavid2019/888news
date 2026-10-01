import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Locale, TranslationKey } from "./types.ts";
import { zhTW } from "./locales/zh-TW.ts";
import { en } from "./locales/en.ts";
import { zhCN } from "./locales/zh-CN.ts";
import { AutoTraditionalConverter } from "./AutoConverter.tsx";


const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  "zh-TW": zhTW,
  en: en,
  "zh-CN": zhCN,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    // Write cookie for SSR (expires in 1 year)
    document.cookie = `site_locale=${encodeURIComponent(newLocale)}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("site_locale", newLocale);
    } catch {
      // ignore storage failure
    }
    // Reload page to re-run SSR loaders with new cookie
    window.location.reload();
  };

  const t = useMemo(() => {
    const dict = DICTIONARIES[locale] || DICTIONARIES["zh-TW"];
    return (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text = dict[key] || DICTIONARIES["zh-TW"][key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    };
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return (
    <LocaleContext.Provider value={value}>
      <AutoTraditionalConverter locale={locale} />
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      locale: "zh-TW",
      setLocale: () => {},
      t: (key: TranslationKey, params?: Record<string, string | number>) => {
        let text = zhTW[key] || key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return text;
      },
    };
  }
  return ctx;
}

export const useLocale = useI18n;
