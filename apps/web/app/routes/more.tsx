import { SITE } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/Sidebar";
import { pageMeta } from "../lib/seo";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { LanguageSwitch } from "../components/shell/LanguageSwitch";
import { useI18n } from "../lib/i18n";
import {
  IconBookmark, IconChart, IconChevronRight, IconFlame, IconGlobe, IconGrid, IconHeart, IconHistory, IconMessage, IconMoon, IconPlug, IconDownload,
} from "../components/icons";
import { triggerPwaInstallModal, isStandalone } from "../components/shell/PwaInstall";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta() {
  return pageMeta({ title: "更多", path: "/more", noindex: true });
}

type Row = { to: string; label: string; icon: ReactNode };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="px-4 pb-1 pt-3 text-[11.5px] text-ink-4">{title}</div>
      <ul className="divide-y divide-line-soft">{children}</ul>
    </section>
  );
}

export default function MorePage() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  const { t } = useI18n();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
  }, []);

  const groups: Array<{ title: string; rows: Row[] }> = [
    {
      title: t("nav.section.content"),
      rows: [
        { to: "/topics", label: t("nav.topics"), icon: <IconGrid size={18} /> },
        ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: t("nav.leaderboard"), icon: <IconChart size={18} /> }] : []),
        ...(FEATURES.codexResetMonitor ? [{ to: "/codex-reset", label: t("nav.codex_reset"), icon: <IconHistory size={18} /> }] : []),
        { to: "/agent", label: t("nav.agent"), icon: <IconPlug size={18} /> },
      ],
    },
    {
      title: t("settings.appearance"),
      rows: [
        { to: "/hot", label: t("nav.hot"), icon: <IconFlame size={18} /> },
        { to: "/starred", label: t("nav.starred"), icon: <IconBookmark size={18} /> },
      ],
    },
    {
      title: t("nav.section.more"),
      rows: [
        { to: "/about", label: `${t("nav.about")} ${SITE.name}`, icon: <IconHeart size={18} /> },
        { to: "/feedback", label: t("nav.feedback"), icon: <IconMessage size={18} /> },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <h1 className="pb-4 pt-5 text-[22px] font-bold text-ink lg:pt-1">{t("nav.more")}</h1>
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 2xl:grid-cols-3">
        {groups.map((g) => (
          <Group key={g.title} title={g.title}>
            {g.rows.map((r) => (
              <li key={r.to}>
                <Link to={r.to} className="flex h-[50px] items-center gap-3 px-4 text-[15px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk">
                  <span className="text-ink-3">{r.icon}</span>
                  <span className="flex flex-1 items-center gap-2">
                    {r.label}
                  </span>
                  <IconChevronRight size={16} className="text-ink-4" />
                </Link>
              </li>
            ))}
            {g.title === t("nav.section.more") && !standalone && (
              <li>
                <button
                  type="button"
                  onClick={triggerPwaInstallModal}
                  className="flex h-[50px] w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk"
                >
                  <span className="text-accent">
                    <IconDownload size={18} />
                  </span>
                  <span className="flex flex-1 items-center gap-2">
                    {t("nav.install_app")} (PWA)
                  </span>
                  <span className="text-[12px] text-ink-4">加到主畫面</span>
                </button>
              </li>
            )}
            {g.title === t("settings.appearance") && (
              <>
                <li className="flex h-[58px] items-center gap-3 px-4 text-[15px] font-medium text-ink">
                  <span className="text-ink-3">
                    <IconGlobe size={18} />
                  </span>
                  <span className="flex-1">{t("settings.language")}</span>
                  <LanguageSwitch className="w-[124px]" />
                </li>
                <li className="flex h-[58px] items-center gap-3 px-4 text-[15px] font-medium text-ink">
                  <span className="text-ink-3">
                    <IconMoon size={18} />
                  </span>
                  <span className="flex-1">{t("settings.theme")}</span>
                  <ThemeSwitch className="w-[124px]" />
                </li>
              </>
            )}
          </Group>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-ink-4">
        <Link to="/terms" className="hover:text-ink-2">{t("common.terms")}</Link>
        <Link to="/privacy" className="hover:text-ink-2">{t("common.privacy")}</Link>
        <a href="/feed.xml" className="hover:text-ink-2">{t("common.rss")}</a>
        {SITE.githubUrl && <a href={SITE.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">GitHub</a>}
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">{SITE.icp}</a>}
      </div>
    </div>
  );
}
