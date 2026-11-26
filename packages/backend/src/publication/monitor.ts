import type { CodexResetPageData, CodexResetSitePage, CodexResetDay, MonitorPlatformId } from "@aihot/contracts/monitor";
import { codexResetPage } from "../monitor/read.ts";

export function siteCodexResetPage(page: CodexResetPageData, date?: string): CodexResetSitePage {
  const latest = page.calendar.reduce((day, mark) => mark.date > day ? mark.date : day, page.calendar[0]?.date ?? page.today);
  const selectedDate = date ?? (page.calendar.some((m) => m.date === page.today) || latest > page.today ? page.today : latest);
  const ids = new Set(page.calendar.filter((m) => m.date === selectedDate).map((m) => m.eventId));
  const { activities: _activities, ...rest } = page;
  return { ...rest, selectedDate, events: page.events.filter((e) => ids.has(e.id)) };
}

export async function loadSiteCodexResetPage(date?: string, now = Date.now(), platform: MonitorPlatformId = "codex") {
  return siteCodexResetPage(await codexResetPage(now, platform), date);
}

export async function loadSiteCodexResetDay(date: string, platform: MonitorPlatformId = "codex"): Promise<CodexResetDay> {
  const page = await loadSiteCodexResetPage(date, Date.now(), platform);
  return { date, version: page.version, events: page.events };
}
