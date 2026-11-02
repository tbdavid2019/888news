import { useEffect, type CSSProperties } from "react";
import { useI18n } from "../../lib/i18n/index.ts";
import {
  DEFAULT_GARRUL_API,
  GARRUL_SCRIPT_ID,
  resolveGarrulLang,
  type GarrulEmbedConfig,
} from "./comments-helper.ts";

export interface CommentsProps extends GarrulEmbedConfig {
  /** Optional container CSS class name */
  className?: string;
  /** Optional style override */
  style?: CSSProperties;
}

export function Comments({
  slug,
  title,
  url,
  published,
  api = DEFAULT_GARRUL_API,
  lang,
  className = "",
  style,
}: CommentsProps) {
  const { locale } = useI18n();
  const resolvedLang = resolveGarrulLang(locale, lang);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const baseApi = api.replace(/\/$/, "");
    const scriptSrc = `${baseApi}/embed.js`;

    // Remove any previously inserted embed script so inserting a fresh one triggers Garrul's init()
    const existingScript = document.getElementById(GARRUL_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.id = GARRUL_SCRIPT_ID;
    script.src = scriptSrc;
    script.defer = true;
    script.async = true;
    script.dataset.garrulEmbed = "true";

    document.body.appendChild(script);

    return () => {
      const s = document.getElementById(GARRUL_SCRIPT_ID);
      if (s) {
        s.remove();
      }
    };
  }, [slug, api, title, url]);

  return (
    <div key={slug} className={`garrul-container w-full ${className}`}>
      <div
        id="garrul"
        data-api={api}
        data-slug={slug}
        data-title={title}
        data-url={url}
        {...(published ? { "data-published": published } : {})}
        data-lang={resolvedLang}
        style={{
          minHeight: "220px",
          ...style,
        }}
      />
    </div>
  );
}

export default Comments;
