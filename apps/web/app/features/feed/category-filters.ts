import { CATEGORY_KEYS, type CategoryKey, type ChannelKey } from "@aihot/contracts/taxonomy";

/** Build the feed's category, channel and topic choices while preserving search and other tag contexts. */
export function categoryFilters(
  base: string,
  params: URLSearchParams,
  category: CategoryKey | null,
  channel: ChannelKey,
  shortcut: { slug: string } | null,
) {
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    next.delete("cursor");
    const query = next.toString();
    return query ? `${base}?${query}` : base;
  };
  const activeTopic = !!shortcut && params.get("topic") === shortcut.slug;
  const clear = { category: null, channel: null, ...(activeTopic ? { topic: null } : {}) };
  const items = [
    { key: "all", to: href(clear) },
    { key: "firstParty", to: href({ ...clear, channel: "firstParty" }) },
    ...(shortcut ? [{ key: "topic", to: href({ ...clear, tag: null, topic: shortcut.slug }) }] : []),
    ...CATEGORY_KEYS.map((key) => ({ key, to: href({ ...clear, category: key }) })),
  ];
  const active = activeTopic
    ? "topic"
    : channel === "firstParty" ? "firstParty" : (category ?? "all");
  return { items, active };
}
