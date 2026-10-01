import { titled } from "./lib/seo";
import { SITE } from "@aihot/industry/site";
import {
  isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, useNavigation, useRouteError, useRouteLoaderData,
  type ShouldRevalidateFunction,
} from "react-router";
import type { ReactNode } from "react";
import type { Route } from "./+types/root";
import "./app.css";
import { Sidebar } from "./components/shell/Sidebar";
import { MobileTabBar } from "./components/shell/MobileTabBar";
import { BackToTop, NavigationProgress } from "./components/shell/Chrome";
import { RingMark } from "./components/Logo";
import { buttonClass } from "./components/ui/Controls";
import { THEME_BOOT_SCRIPT } from "./lib/local-state.ts";

import { apiGet } from "./lib/api.server.ts";
import { useHydratedFlag } from "./lib/hydration.ts";
import { detectLocale, LocaleProvider, useI18n, type Locale } from "./lib/i18n/index.ts";
import { PwaAutoPrompt } from "./components/shell/PwaInstall.tsx";





export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "icon", type: "image/png", href: "/icon.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "alternate", type: "application/rss+xml", title: `${SITE.name} — 精選`, href: "/feed.xml" },
];

const SW_REGISTER_SCRIPT = `
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(err) {
      console.debug('SW register failed:', err);
    });
  });
}
`;

interface SiteMeta {
  changelogVersion: string | null;
  locale: Locale;
}

export async function loader({ request }: Route.LoaderArgs) {
  const locale = detectLocale(request);
  try {
    const meta = await apiGet<Omit<SiteMeta, "locale">>("/api/site/meta", { signal: request.signal });
    return { ...meta, locale };
  } catch {
    return { changelogVersion: null, locale } satisfies SiteMeta;
  }
}

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData<typeof loader>("root");
  const locale = rootData?.locale ?? "zh-TW";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#13191c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={SITE.name} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content={SITE.name} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: `
if (typeof window !== 'undefined') {
  window.__deferredPwaPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window.__deferredPwaPrompt = e;
    if (typeof window.__onPwaPromptReady === 'function') {
      window.__onPwaPromptReady(e);
    }
  });
}
` }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={(location) => location.key} />
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </body>
    </html>
  );
}

/** Only a page nobody matched falls back to this; every page names itself. */
export function meta({ error }: Route.MetaArgs) {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: titled(notFound ? "頁面不存在" : "暫時無法載入") }, { name: "robots", content: "noindex" }];
}

/** Sidebar, main column and phone tab bar around a page (or an error). */
function SiteShell({ changelogVersion, children }: { changelogVersion: string | null; children: ReactNode }) {
  const navigation = useNavigation();
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh">
      <NavigationProgress active={navigation.state === "loading"} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        {t("nav.skip_to_content")}
      </a>
      <Sidebar changelogVersion={changelogVersion} />
      {/* Mobile shell (≤ 960px): one centred column, the tab bar below. Desktop: the page fills the main area
          up to the list width (--page-max-wide), centred beyond it. */}
      <main id="main" className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] lg:px-7 lg:pb-[72px] lg:pt-6">
        <div className="mx-auto w-full max-w-[640px] px-4 lg:max-w-[var(--page-max-wide)] lg:px-0">{children}</div>
      </main>
      <MobileTabBar changelogVersion={changelogVersion} />
      <BackToTop />
    </div>
  );
}

export default function App() {
  const meta = useLoaderData<typeof loader>();
  useHydratedFlag();
  const { pathname } = useLocation();
  // The admin has its own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      <LocaleProvider locale={meta.locale}>
        <Outlet />
      </LocaleProvider>
    );
  }
  return (
    <LocaleProvider locale={meta.locale}>
      <SiteShell changelogVersion={meta.changelogVersion}>
        <Outlet />
      </SiteShell>
      <PwaAutoPrompt />
    </LocaleProvider>
  );
}

function ErrorView({ status, notFound }: { status: number; notFound: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-2 py-16">
      <div className="max-w-sm text-center">
        <RingMark className="mx-auto mb-5 size-10 text-accent" />
        <div className="mono text-[12px] text-ink-4">{status}</div>
        <h1 className="mt-1.5 text-[20px] font-bold text-ink">
          {notFound ? t("error.not_found_title") : t("error.unavailable_title")}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          {notFound ? t("error.not_found_desc") : t("error.unavailable_desc")}
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <Link to="/" className={buttonClass("primary")}>
            {t("error.back_home")}
          </Link>
          <Link to="/all" className={buttonClass("secondary")}>
            {t("error.browse_all")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const site = useRouteLoaderData<typeof loader>("root");
  const { pathname } = useLocation();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const locale = site?.locale ?? (typeof window !== "undefined" ? detectLocale() : "zh-TW");

  const content = <ErrorView status={status} notFound={notFound} />;
  // Admin errors stay inside the admin's own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <LocaleProvider locale={locale}>{content}</LocaleProvider>;
  }
  return (
    <LocaleProvider locale={locale}>
      <SiteShell changelogVersion={site?.changelogVersion ?? null}>{content}</SiteShell>
    </LocaleProvider>
  );
}
