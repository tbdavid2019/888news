// WCAG 2.1 / 2.2 AA and AAA contrast ratio verification test suite for Design Tokens.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.resolve(__dirname, "../app/app.css");

/** Convert a 3- or 6-digit hex string into RGB values [0..255]. */
export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const [r, g, b] = clean.split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  throw new Error(`Unsupported hex color format: ${hex}`);
}

/** Convert sRGB 8-bit channel to linear channel per WCAG 2.1 spec. */
export function sRGBToLinear(val: number): number {
  const c = val / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Calculate relative luminance of a color per WCAG 2.1 formula. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * sRGBToLinear(r) + 0.7152 * sRGBToLinear(g) + 0.0722 * sRGBToLinear(b);
}

/** Calculate contrast ratio between two colors per WCAG 2.1 formula (1:1 to 21:1). */
export function contrastRatio(color1: string, color2: string): number {
  const lum1 = relativeLuminance(color1);
  const lum2 = relativeLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Extract CSS variable declarations from a selector block in CSS source. */
function extractTokens(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "g");
  const match = regex.exec(css);
  if (!match) return {};
  const block = match[1];
  const tokens: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).replace(/;.*$/, "").trim();
        tokens[key] = val;
      }
    }
  }
  return tokens;
}

const cssContent = readFileSync(CSS_PATH, "utf8");
const themeTokens = extractTokens(cssContent, "@theme");
const lightTokens = extractTokens(cssContent, ":root");
const darkTokens = extractTokens(cssContent, '[data-theme="dark"]');

test("WCAG mathematical calculation baseline verification", () => {
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000") * 100) / 100, 21);
  assert.equal(Math.round(contrastRatio("#000000", "#000000") * 100) / 100, 1);
  assert.equal(Math.round(contrastRatio("#ffffff", "#ffffff") * 100) / 100, 1);
  // Pure white vs #767676 is the canonical ~4.54:1 borderline for AA
  assert.ok(contrastRatio("#ffffff", "#767676") >= 4.5);
});

test("Brand (VI) fixed tokens are configured correctly in @theme", () => {
  assert.equal(themeTokens["--color-brand-saffron"], "#ffb010");
  assert.equal(themeTokens["--color-brand-blue"], "#17324d");
  assert.equal(themeTokens["--color-brand-clay"], "#a9471d");
  assert.equal(themeTokens["--color-saffron"], "#ffb010");
  assert.equal(themeTokens["--color-saffron-ink"], "#2b251a");
});

test("Light Mode: Key text colors strictly satisfy WCAG AA (>= 4.5:1) and AAA (>= 7.0:1)", () => {
  const backgrounds = [
    { name: "--bg", hex: lightTokens["--bg"] },
    { name: "--surface", hex: lightTokens["--surface"] },
    { name: "--surface-2", hex: lightTokens["--surface-2"] },
    { name: "--bg-sunk", hex: lightTokens["--bg-sunk"] },
    { name: "--sidebar", hex: lightTokens["--sidebar"] },
    { name: "--daybar", hex: lightTokens["--daybar"] },
  ];

  // 1. AAA level texts (>= 7.0:1)
  const aaaForegrounds = [
    { name: "--ink", hex: lightTokens["--ink"] },
    { name: "--ink-2", hex: lightTokens["--ink-2"] },
    { name: "--ink-3", hex: lightTokens["--ink-3"] },
    { name: "--accent", hex: lightTokens["--accent"] },
    { name: "--accent-ink", hex: lightTokens["--accent-ink"] },
    { name: "--ok-ink", hex: lightTokens["--ok-ink"] },
  ];

  for (const bg of backgrounds) {
    for (const fg of aaaForegrounds) {
      const cr = contrastRatio(fg.hex, bg.hex);
      assert.ok(
        cr >= 7.0,
        `Light Mode: expected ${fg.name} (${fg.hex}) on ${bg.name} (${bg.hex}) to satisfy WCAG AAA (>= 7.0:1), got ${cr.toFixed(2)}:1`,
      );
    }
  }

  // 2. AA level normal texts (>= 4.5:1)
  const aaForegrounds = [
    { name: "--ink-4", hex: lightTokens["--ink-4"] },
    { name: "--hot", hex: lightTokens["--hot"] },
    { name: "--amber-ink", hex: lightTokens["--amber-ink"] },
    { name: "--ok", hex: lightTokens["--ok"] },
  ];

  for (const bg of backgrounds) {
    for (const fg of aaForegrounds) {
      const cr = contrastRatio(fg.hex, bg.hex);
      assert.ok(
        cr >= 4.5,
        `Light Mode: expected ${fg.name} (${fg.hex}) on ${bg.name} (${bg.hex}) to satisfy WCAG AA (>= 4.5:1), got ${cr.toFixed(2)}:1`,
      );
    }
  }

  // 3. UI badges / graphical elements (>= 3.0:1)
  for (const bg of backgrounds) {
    const crAmber = contrastRatio(lightTokens["--amber"], bg.hex);
    assert.ok(
      crAmber >= 3.0,
      `Light Mode: expected --amber (${lightTokens["--amber"]}) on ${bg.name} (${bg.hex}) to satisfy WCAG UI/Large (>= 3.0:1), got ${crAmber.toFixed(2)}:1`,
    );
  }

  // 4. Accent contrast text on solid accent button/badge
  const crAccentContrast = contrastRatio(lightTokens["--accent-contrast"], lightTokens["--accent"]);
  assert.ok(
    crAccentContrast >= 7.0,
    `Light Mode: expected --accent-contrast on --accent to satisfy WCAG AAA (>= 7.0:1), got ${crAccentContrast.toFixed(2)}:1`,
  );

  // 5. Secondary muted background (--bg-muted) coverage
  const bgMuted = lightTokens["--bg-muted"];
  const crInkMuted = contrastRatio(lightTokens["--ink"], bgMuted);
  const crInk2Muted = contrastRatio(lightTokens["--ink-2"], bgMuted);
  const crInk3Muted = contrastRatio(lightTokens["--ink-3"], bgMuted);
  const crInk4Muted = contrastRatio(lightTokens["--ink-4"], bgMuted);
  const crAccentMuted = contrastRatio(lightTokens["--accent"], bgMuted);

  assert.ok(crInkMuted >= 7.0, `expected --ink on --bg-muted to satisfy AAA (>= 7.0:1), got ${crInkMuted.toFixed(2)}:1`);
  assert.ok(crInk2Muted >= 7.0, `expected --ink-2 on --bg-muted to satisfy AAA (>= 7.0:1), got ${crInk2Muted.toFixed(2)}:1`);
  assert.ok(crInk3Muted >= 4.5, `expected --ink-3 on --bg-muted to satisfy AA (>= 4.5:1), got ${crInk3Muted.toFixed(2)}:1`);
  assert.ok(crInk4Muted >= 4.5, `expected --ink-4 on --bg-muted to satisfy AA (>= 4.5:1), got ${crInk4Muted.toFixed(2)}:1`);
  assert.ok(crAccentMuted >= 7.0, `expected --accent on --bg-muted to satisfy AAA (>= 7.0:1), got ${crAccentMuted.toFixed(2)}:1`);
});

test("Dark Mode: Key text colors strictly satisfy WCAG AA (>= 4.5:1) and AAA (>= 7.0:1)", () => {
  const primaryBgs = [
    { name: "--bg", hex: darkTokens["--bg"] },
    { name: "--surface", hex: darkTokens["--surface"] },
    { name: "--bg-sunk", hex: darkTokens["--bg-sunk"] },
    { name: "--bg-muted", hex: darkTokens["--bg-muted"] },
    { name: "--daybar", hex: darkTokens["--daybar"] },
  ];
  const allBgs = [
    ...primaryBgs,
    { name: "--surface-2", hex: darkTokens["--surface-2"] },
    { name: "--raised", hex: darkTokens["--raised"] },
  ];

  // 1. AAA level texts (>= 7.0:1) on all dark backgrounds
  const aaaForegrounds = [
    { name: "--ink", hex: darkTokens["--ink"] },
    { name: "--ink-2", hex: darkTokens["--ink-2"] },
    { name: "--accent", hex: darkTokens["--accent"] },
    { name: "--accent-ink", hex: darkTokens["--accent-ink"] },
    { name: "--amber", hex: darkTokens["--amber"] },
    { name: "--amber-ink", hex: darkTokens["--amber-ink"] },
    { name: "--ok", hex: darkTokens["--ok"] },
    { name: "--ok-ink", hex: darkTokens["--ok-ink"] },
  ];

  for (const bg of allBgs) {
    for (const fg of aaaForegrounds) {
      const cr = contrastRatio(fg.hex, bg.hex);
      assert.ok(
        cr >= 7.0,
        `Dark Mode: expected ${fg.name} (${fg.hex}) on ${bg.name} (${bg.hex}) to satisfy WCAG AAA (>= 7.0:1), got ${cr.toFixed(2)}:1`,
      );
    }
  }

  // 2. ink-3 satisfies AAA on primary backgrounds and AA across all dark backgrounds
  for (const bg of primaryBgs) {
    const cr = contrastRatio(darkTokens["--ink-3"], bg.hex);
    assert.ok(
      cr >= 7.0,
      `Dark Mode: expected --ink-3 on ${bg.name} to satisfy WCAG AAA (>= 7.0:1), got ${cr.toFixed(2)}:1`,
    );
  }
  for (const bg of allBgs) {
    const cr = contrastRatio(darkTokens["--ink-3"], bg.hex);
    assert.ok(
      cr >= 4.5,
      `Dark Mode: expected --ink-3 on ${bg.name} to satisfy WCAG AA (>= 4.5:1), got ${cr.toFixed(2)}:1`,
    );
  }

  // 3. hot text satisfies AA (>= 4.5:1) on all dark backgrounds
  for (const bg of allBgs) {
    const cr = contrastRatio(darkTokens["--hot"], bg.hex);
    assert.ok(
      cr >= 4.5,
      `Dark Mode: expected --hot on ${bg.name} to satisfy WCAG AA (>= 4.5:1), got ${cr.toFixed(2)}:1`,
    );
  }

  // 4. ink-4 satisfies AA on primary surfaces and UI/Large text (>= 3.0:1) on raised surfaces
  for (const bg of primaryBgs) {
    const cr = contrastRatio(darkTokens["--ink-4"], bg.hex);
    assert.ok(
      cr >= 4.5,
      `Dark Mode: expected --ink-4 on ${bg.name} to satisfy WCAG AA (>= 4.5:1), got ${cr.toFixed(2)}:1`,
    );
  }
  for (const bg of allBgs) {
    const cr = contrastRatio(darkTokens["--ink-4"], bg.hex);
    assert.ok(
      cr >= 3.0,
      `Dark Mode: expected --ink-4 on ${bg.name} to satisfy WCAG UI/Large (>= 3.0:1), got ${cr.toFixed(2)}:1`,
    );
  }

  // 5. Accent contrast text on solid accent button/badge
  const crAccentContrast = contrastRatio(darkTokens["--accent-contrast"], darkTokens["--accent"]);
  assert.ok(
    crAccentContrast >= 7.0,
    `Dark Mode: expected --accent-contrast on --accent to satisfy WCAG AAA (>= 7.0:1), got ${crAccentContrast.toFixed(2)}:1`,
  );
});

test("Saffron (#ffb010) active indicator contrast complies with WCAG AAA", () => {
  const crInk = contrastRatio(themeTokens["--color-saffron-ink"] ?? "#2b251a", "#ffb010");
  const crBlue = contrastRatio("#17324d", "#ffb010");
  assert.ok(crInk >= 7.0, `Saffron with ink must pass AAA (>=7.0:1), got ${crInk.toFixed(2)}:1`);
  assert.ok(crBlue >= 7.0, `Saffron with deep blue must pass AAA (>=7.0:1), got ${crBlue.toFixed(2)}:1`);
});

test("Rank tokens satisfy WCAG contrast requirements on both Light and Dark themes", () => {
  // Light Mode Rank tokens on primary backgrounds
  const lightBgs = [lightTokens["--bg"], lightTokens["--surface"], lightTokens["--bg-sunk"]];
  for (const bg of lightBgs) {
    const crRank1 = contrastRatio(lightTokens["--rank-1"], bg);
    const crRank2 = contrastRatio(lightTokens["--rank-2"], bg);
    const crRank3 = contrastRatio(lightTokens["--rank-3"], bg);
    const crRankRest = contrastRatio(lightTokens["--rank-rest"], bg);

    assert.ok(crRank1 >= 4.5, `Light rank-1 on ${bg} must pass AA (>=4.5:1), got ${crRank1.toFixed(2)}:1`);
    assert.ok(crRank2 >= 4.5, `Light rank-2 on ${bg} must pass AA (>=4.5:1), got ${crRank2.toFixed(2)}:1`);
    assert.ok(crRank3 >= 4.5, `Light rank-3 on ${bg} must pass AA (>=4.5:1), got ${crRank3.toFixed(2)}:1`);
    assert.ok(crRankRest >= 4.5, `Light rank-rest on ${bg} must pass AA (>=4.5:1), got ${crRankRest.toFixed(2)}:1`);
  }

  // Dark Mode Rank tokens on primary backgrounds
  const darkBgs = [darkTokens["--bg"], darkTokens["--surface"], darkTokens["--bg-sunk"], darkTokens["--bg-muted"]];
  for (const bg of darkBgs) {
    const crRank1 = contrastRatio(darkTokens["--rank-1"], bg);
    const crRank2 = contrastRatio(darkTokens["--rank-2"], bg);
    const crRank3 = contrastRatio(darkTokens["--rank-3"], bg);
    const crRankRest = contrastRatio(darkTokens["--rank-rest"], bg);

    assert.ok(crRank1 >= 4.5, `Dark rank-1 on ${bg} must pass AA (>=4.5:1), got ${crRank1.toFixed(2)}:1`);
    assert.ok(crRank2 >= 4.5, `Dark rank-2 on ${bg} must pass AA (>=4.5:1), got ${crRank2.toFixed(2)}:1`);
    assert.ok(crRank3 >= 4.5, `Dark rank-3 on ${bg} must pass AA (>=4.5:1), got ${crRank3.toFixed(2)}:1`);
    assert.ok(crRankRest >= 4.0, `Dark rank-rest on ${bg} must pass UI/sub-text (>=4.0:1), got ${crRankRest.toFixed(2)}:1`);
  }
});
