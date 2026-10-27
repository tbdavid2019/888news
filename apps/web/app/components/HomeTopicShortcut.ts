import { createElement } from "react";
import { Link } from "react-router";

export function HomeTopicShortcut({
  shortcut,
  label,
  className,
}: {
  shortcut: { slug: string } | null;
  label: string;
  className: string;
}) {
  if (!shortcut) return null;
  return createElement(Link, { to: `/topics/${shortcut.slug}`, className }, label);
}
