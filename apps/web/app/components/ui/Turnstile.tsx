import { useEffect, useRef, useState } from "react";

interface TurnstileProps {
  siteKey?: string;
  action?: string;
  dwellToken?: string;
  onVerify?: (token: string) => void;
  onError?: (error?: string) => void;
  onExpire?: () => void;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          action?: string;
          callback?: (token: string) => void;
          "error-callback"?: (error?: string) => void;
          "expired-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact" | "flexible";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const DEFAULT_SITE_KEY = "0x4AAAAAAEvqf7unH6MrhIv2";
const SCRIPT_ID = "cf-turnstile-script";

function ensureTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile script load error")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script network error"));
    document.head.appendChild(script);
  });
}

export function Turnstile({
  siteKey = DEFAULT_SITE_KEY,
  action = "general",
  dwellToken = "",
  onVerify,
  onError,
  onExpire,
  className = "",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;

    // Timeout guard: if script doesn't load within 4.5 seconds, activate fallback mode
    const timeout = setTimeout(() => {
      if (!cancelled && status === "loading") {
        setStatus("fallback");
        onError?.("timeout_fallback");
      }
    }, 4500);

    ensureTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        clearTimeout(timeout);

        try {
          if (widgetIdRef.current) {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
          }

          const id = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            theme: "auto",
            size: "normal",
            callback: (newToken) => {
              if (cancelled) return;
              setToken(newToken);
              setStatus("verified");
              onVerify?.(newToken);
            },
            "error-callback": (err) => {
              if (cancelled) return;
              console.warn("Turnstile challenge error, switching to fallback:", err);
              setStatus("fallback");
              onError?.(err);
            },
            "expired-callback": () => {
              if (cancelled) return;
              setToken("");
              setStatus("ready");
              onExpire?.();
            },
          });

          widgetIdRef.current = id;
          setStatus("ready");
        } catch (e) {
          console.warn("Turnstile render error, switching to fallback:", e);
          setStatus("fallback");
          onError?.("render_failed");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        clearTimeout(timeout);
        console.warn("Turnstile script unavailable, switching to fallback:", err);
        setStatus("fallback");
        onError?.("script_unavailable");
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  return (
    <div className={`turnstile-wrapper my-3 ${className}`}>
      {/* Container for Cloudflare Turnstile managed iframe */}
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center overflow-hidden" />

      {/* Fallback indicator when Turnstile service is degraded or blocked */}
      {status === "fallback" && (
        <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12px] text-ink-3">
          <span className="inline-block size-2 rounded-full bg-accent animate-pulse" />
          <span>安全防護備援模式已啟用（免額外驗證）</span>
        </div>
      )}

      {/* Hidden inputs submitted with form */}
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <input type="hidden" name="turnstile_token" value={token} />
      <input type="hidden" name="_dwell_token" value={dwellToken} />
      {/* Invisible Honeypot trap: bots autofill this, humans never see it */}
      <input
        type="text"
        name="_hp_verification"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
