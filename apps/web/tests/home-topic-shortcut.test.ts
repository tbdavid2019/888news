import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test from "node:test";
import assert from "node:assert/strict";
import { HomeTopicShortcut } from "../app/components/HomeTopicShortcut.ts";
import { SITE } from "@aihot/industry/site";

const renderShortcut = (shortcut: { slug: string } | null) => renderToStaticMarkup(
  createElement(MemoryRouter, null,
    createElement(HomeTopicShortcut, { shortcut, label: "Security", className: "chip" })
  )
);

test("home topic shortcut renders the configured href and can be disabled", () => {
  assert.match(renderShortcut(SITE.homeTopicShortcut), /href="\/topics\/infosec"/);
  assert.match(renderShortcut({ slug: "systems" }), /href="\/topics\/systems"/);
  assert.equal(renderShortcut(null), "");
});
