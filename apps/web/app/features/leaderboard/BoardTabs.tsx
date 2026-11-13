import { useLocation } from "react-router";
import { LEADERBOARD_BOARD_LABELS, LEADERBOARD_PUBLIC_BOARDS } from "@aihot/contracts/taxonomy";
import { PillTabs } from "../../components/ui/Tabs";
import { boardHref } from "./format";

/** Board switcher. It lives in the shared layout, so the thumb glides between boards. */
export function BoardTabs() {
  const { pathname } = useLocation();
  const active = pathname === "/leaderboard/decisions"
    ? "decisions"
    : LEADERBOARD_PUBLIC_BOARDS.find((k) => boardHref(k) === pathname) ?? "overall";
  return (
    <PillTabs
      layoutId="lb-board"
      label="榜單"
      active={active}
      items={[
        ...LEADERBOARD_PUBLIC_BOARDS.map((k) => ({ key: k, label: LEADERBOARD_BOARD_LABELS[k], to: boardHref(k) })),
        { key: "decisions", label: "決策模型", to: "/leaderboard/decisions" },
      ]}
    />
  );
}
