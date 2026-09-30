// Site navigation, one place for the desktop sidebar, the mobile tab bar and the mobile "更多" page.
import { withSubject } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import type { ReactNode } from "react";
import type { TranslationKey } from "../../lib/i18n";
import {
  IconApps, IconBolt, IconBookmark, IconChart, IconDoc, IconFlame, IconGrid, IconHeart, IconHistory, IconList, IconMessage, IconPlug,
} from "../icons";

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** Match the path exactly (the home page). */
  end?: boolean;
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
}

export function getSidebar(t: (key: TranslationKey) => string, locale: string = "zh-TW"): Array<{ title: string; items: NavItem[] }> {
  const isEn = locale === "en";
  const allLabel = isEn ? "All Stories" : `全部${withSubject(locale === "zh-TW" ? "動態" : "动态")}`;
  const dailyLabel = isEn ? "Daily Brief" : withSubject(locale === "zh-TW" ? "日報" : "日报");

  return [
    {
      title: t("nav.section.content"),
      items: [
        { to: "/", label: t("nav.featured"), icon: IconBolt, end: true },
        { to: "/all", label: allLabel, icon: IconList },
        { to: "/hot", label: t("nav.hot"), icon: IconFlame },
        { to: "/daily", label: dailyLabel, icon: IconDoc },
        { to: "/topics", label: t("nav.topics"), icon: IconGrid },
        { to: "/starred", label: t("nav.starred"), icon: IconBookmark },
      ],
    },
    // The optional AI-only modules (industry/features.ts).
    ...(FEATURES.leaderboard || FEATURES.codexResetMonitor
      ? [
          {
            title: t("nav.section.models"),
            items: [
              ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: t("nav.leaderboard"), icon: IconChart }] : []),
              ...(FEATURES.codexResetMonitor ? [{ to: "/codex-reset", label: t("nav.codex_reset"), icon: IconHistory }] : []),
            ],
          },
        ]
      : []),
    {
      title: t("nav.section.more"),
      items: [
        { to: "/agent", label: t("nav.agent"), icon: IconPlug },
        { to: "/about", label: t("nav.about"), icon: IconHeart },
        { to: "/feedback", label: t("nav.feedback"), icon: IconMessage },
      ],
    },
  ];
}

export function getTabBar(t: (key: TranslationKey) => string): NavItem[] {
  return [
    { to: "/", label: t("nav.featured"), icon: IconBolt, end: true },
    { to: "/all", label: t("nav.all_short"), icon: IconList },
    { to: "/daily", label: t("nav.daily_short"), icon: IconDoc },
    { to: "/more", label: t("nav.more"), icon: IconApps },
  ];
}

/** Fallback static arrays for backwards-compatibility */
export const SIDEBAR = getSidebar((k) => k);
export const TABBAR = getTabBar((k) => k);

/** Pages reached from the mobile "更多" tab keep that tab highlighted. */
export const MORE_PATHS = ["/more", "/hot", "/topics", "/starred", "/leaderboard", "/agent", "/about", "/feedback", "/terms", "/privacy"];

export function tabIsActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to;
  if (item.to === "/more") return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (item.to === "/daily") return /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
