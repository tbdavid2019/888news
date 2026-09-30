import { Link, useLocation } from "react-router";
import { getTabBar, tabIsActive } from "./nav";
import { useChangelogDot } from "./Sidebar";
import { useI18n } from "../../lib/i18n";

/** Bottom tab bar of the mobile shell (up to 960px), as on the original site. */
export function MobileTabBar({ changelogVersion }: { changelogVersion: string | null }) {
  const { pathname } = useLocation();
  const dot = useChangelogDot(changelogVersion);
  const { t } = useI18n();
  const tabbar = getTabBar(t);

  return (
    <nav aria-label="Bottom Navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid h-[54px] max-w-[640px] grid-cols-4">
        {tabbar.map((item) => {
          const active = tabIsActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              prefetch="intent"
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-[3px] text-[11px] transition-colors ${active ? "font-semibold text-accent" : "text-ink-3 active:text-ink"}`}
            >
              <Icon size={21} />
              <span>{item.label}</span>
              {dot && item.changelog && <span className="absolute right-[calc(50%-17px)] top-2 size-1.5 rounded-full bg-hot" aria-label={t("nav.new_update")} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
