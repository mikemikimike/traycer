/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compositeOverBackground,
  contrastRatio,
  resolveThemeTokens,
  themePresets,
  themeToken,
  type ResolvedThemeMode,
} from "@/../__tests__/contrast";

/**
 * The layout editor's decoration, measured against every built-in palette in
 * both modes - Amoled included, which is the one that catches a treatment
 * that only works on a mid-grey.
 *
 * Every colour, alpha and opacity below is READ OUT of `layout-editor.css`
 * and every token out of the palette registry, so this matrix re-measures
 * whatever ships rather than a copy of it. A rule that stops parsing throws,
 * which is what keeps a renamed selector from quietly turning the matrix into
 * a measurement of nothing.
 *
 * The bars are WCAG's, applied to what each thing IS. 4.5:1 for anything with
 * words in it - the name chip, the inspector's body and secondary text. 3:1
 * for an INDICATOR, which is the hover outline and the travelling ring: those
 * are the only things that say "this is the element you are editing", so they
 * answer to 1.4.11. (The static outline on a selected region's OTHER instances
 * was a third, until L-87 left every region with exactly one - see
 * `layout-editor.css`.)
 *
 * The passive dim and a materialised ghost do NOT. Both are deliberately
 * faint, and 1.4.11 exempts a component that is not available for
 * interaction - the canvas is behind the edit firewall and a ghost is a
 * preview of a region that is switched OFF. Inventing a ratio for them would
 * be inventing the design. What they are held to instead is relational, and
 * both relations are real: a dim has to be visibly a dim in every palette
 * (the treatment it replaced, a 35% black scrim, satisfied every ratio here
 * and was invisible on Amoled), and a ghost must never read quieter than the
 * calm chrome it appears among.
 */

const CSS_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "layout-editor.css",
);

const TEXT = 4.5;
const NON_TEXT = 3;

/** Every surface the editor's decoration can land on. */
const SURFACES = ["background", "canvas", "card", "popover", "sidebar"];

// --- the real stylesheet ----------------------------------------------------

interface CssRule {
  /** The `@media` prelude this rule sits under, or `""` at the top level. */
  readonly context: string;
  readonly selector: string;
  readonly body: string;
}

/**
 * Brace-depth parse rather than a flat regex: the fallbacks that matter here
 * live INSIDE `@media` blocks and restate a selector the top level already
 * has, so a parser that cannot tell the two apart would measure the wrong one.
 */
function parseCss(css: string): ReadonlyArray<CssRule> {
  const rules: CssRule[] = [];
  const open: string[] = [];
  let buffer = "";
  for (const character of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (character === "{") {
      open.push(buffer.trim());
      buffer = "";
      continue;
    }
    if (character === "}") {
      const prelude = open.pop() ?? "";
      if (!prelude.startsWith("@")) {
        rules.push({
          context: open.filter((entry) => entry.startsWith("@")).join(" "),
          selector: prelude.replace(/\s+/g, " "),
          body: buffer,
        });
      }
      buffer = "";
      continue;
    }
    buffer += character;
  }
  return rules;
}

const RULES = parseCss(readFileSync(CSS_FILE, "utf8"));

/** The value of `property` in the first rule the predicate accepts. */
function cssValue(
  matches: (rule: CssRule) => boolean,
  property: string,
): string {
  for (const rule of RULES) {
    if (!matches(rule)) continue;
    const value = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`)
      .exec(rule.body)?.[1]
      ?.trim();
    if (value !== undefined) return value;
  }
  throw new Error(`layout-editor.css: no ${property} for the expected rule`);
}

const topLevel =
  (test: (selector: string) => boolean) =>
  (rule: CssRule): boolean =>
    rule.context === "" && test(rule.selector);

const under =
  (query: string, test: (selector: string) => boolean) =>
  (rule: CssRule): boolean =>
    rule.context.includes(query) && test(rule.selector);

/** `var(--token)` -> `--token`, rejecting anything else by name. */
function tokenName(value: string): string {
  const name = /var\((--[a-z-]+)\)/.exec(value)?.[1];
  if (name === undefined) {
    throw new Error(`layout-editor.css: ${value} is not a theme var()`);
  }
  return name;
}

/**
 * Every SOLID band in a `box-shadow`, by token.
 *
 * A band inside a `color-mix(...)` is translucent and carries no guarantee of
 * its own, so it is left out: what the ring owes is that at least one of the
 * bands a user actually sees clears the indicator floor.
 */
function solidShadowTokens(shadow: string): ReadonlyArray<string> {
  return shadow
    .replace(/color-mix\((?:[^()]|\([^()]*\))*\)/g, "")
    .split(",")
    .flatMap((band) => {
      const name = /var\((--[a-z-]+)\)/.exec(band)?.[1];
      return name === undefined ? [] : [name];
    });
}

/** `color-mix(in srgb, <color> N%, transparent)` -> N/100. */
function mixAlpha(value: string): number {
  const percent = /(\d+(?:\.\d+)?)%/.exec(value)?.[1];
  if (percent === undefined) {
    throw new Error(`layout-editor.css: ${value} carries no percentage`);
  }
  return Number(percent) / 100;
}

const HOVER_OUTLINE = tokenName(
  cssValue(
    topLevel((selector) => selector.includes('[data-hover="1"]')),
    "outline",
  ),
);
const RING_SHADOW = cssValue(
  topLevel((selector) => selector === "[data-layout-selection-ring]"),
  "box-shadow",
);
const RING_BANDS = solidShadowTokens(RING_SHADOW);
const RING_HALO_ALPHA = mixAlpha(RING_SHADOW);
const CHIP_FILL = tokenName(
  cssValue(
    topLevel((selector) => selector === "[data-layout-hover-chip]"),
    "background",
  ),
);
const CHIP_TEXT = tokenName(
  cssValue(
    topLevel((selector) => selector === "[data-layout-hover-chip]"),
    "color",
  ),
);
const GHOST_OPACITY = Number(
  cssValue(
    topLevel((selector) => selector.includes('[data-ghost="1"]')),
    "opacity",
  ),
);
const DIM_RULE = RULES.find(
  (rule) =>
    rule.context === "" &&
    rule.selector.includes("[data-layout-passive]") &&
    rule.body.includes("opacity:"),
);
const DIM_OPACITY = Number(
  cssValue(
    topLevel((selector) => selector.includes("[data-layout-passive]")),
    "opacity",
  ),
);
const FLOAT_MATERIAL = cssValue(
  topLevel((selector) => selector.includes('[data-dock-mode="float"]')),
  "background",
);
const FLOAT_SURFACE = tokenName(FLOAT_MATERIAL);
const FLOAT_ALPHA = mixAlpha(FLOAT_MATERIAL);
const FLOAT_OPAQUE = tokenName(
  cssValue(
    under("prefers-reduced-transparency", (selector) =>
      selector.includes('[data-dock-mode="float"]'),
    ),
    "background",
  ),
);
const INSPECTOR_SURFACE = tokenName(
  cssValue(
    topLevel((selector) => selector === "[data-layout-inspector]"),
    "background",
  ),
);
const EDITING_OUTLINE_RULE = RULES.find(
  (rule) =>
    rule.context === "" && rule.selector.includes("[data-layout-column]"),
);
const EDITING_OUTLINE = tokenName(
  cssValue(
    topLevel((selector) => selector.includes("[data-layout-column]")),
    "outline",
  ),
);
const EDITING_OUTLINE_OFFSET = cssValue(
  topLevel((selector) => selector.includes("[data-layout-column]")),
  "outline-offset",
);

/**
 * The amber cap the sample tab ships, read out of the tab kind itself.
 *
 * The tab's colour is a TSX field and the outline is CSS, and they are one
 * signal: a reader who sees an amber tab and a differently-coloured screen
 * outline learns nothing from either. Read rather than restated, so a change
 * to one of them fails here instead of drifting.
 */
const SAMPLE_TAB_COLOR = (() => {
  const source = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "stores",
      "tabs",
      "kinds",
      "sample-workspace.tsx",
    ),
    "utf8",
  );
  const value = /appearance:\s*\{\s*color:\s*"([^"]+)"/.exec(source)?.[1];
  if (value === undefined) {
    throw new Error("sample-workspace.tsx: no appearance colour to measure");
  }
  return tokenName(value);
})();

// --- measuring --------------------------------------------------------------

interface Palette {
  readonly label: string;
  readonly tokens: ReadonlyMap<string, string>;
}

const PALETTES: ReadonlyArray<Palette> = themePresets().flatMap((preset) =>
  (["light", "dark"] as const).map((mode: ResolvedThemeMode) => ({
    label: `${preset}/${mode}`,
    tokens: resolveThemeTokens(preset, mode),
  })),
);

type Need = (name: string, fg: string, bg: string, minimum: number) => void;

/** Runs `check` for every palette and returns EVERY violated pair. */
function violations(check: (palette: Palette, need: Need) => void): string[] {
  const failed: string[] = [];
  for (const palette of PALETTES) {
    check(palette, (name, fg, bg, minimum) => {
      const ratio = contrastRatio(fg, bg);
      if (ratio < minimum) {
        failed.push(
          `${palette.label} ${name}: ${ratio.toFixed(2)} < ${minimum}`,
        );
      }
    });
  }
  return failed;
}

/** One indicator, measured on every surface it can be drawn over. */
function onSurfaces(
  palette: Palette,
  need: Need,
  name: string,
  paint: (surface: string) => string,
): void {
  for (const surface of SURFACES) {
    const ground = themeToken(palette.tokens, `--${surface}`);
    need(`${name} on ${surface}`, paint(ground), ground, NON_TEXT);
  }
}

describe("layout-editor.css is read, not assumed", () => {
  it("yields the tokens, alphas and opacities the matrix measures", () => {
    expect(HOVER_OUTLINE).toBe("--foreground");
    expect(RING_BANDS).toContain("--ring");
    expect(RING_HALO_ALPHA).toBeGreaterThan(0);
    expect(RING_HALO_ALPHA).toBeLessThan(1);
    expect(CHIP_FILL).toBe("--foreground");
    expect(CHIP_TEXT).toBe("--background");
    expect(GHOST_OPACITY).toBeGreaterThan(0);
    expect(GHOST_OPACITY).toBeLessThan(1);
    expect(DIM_OPACITY).toBeGreaterThan(0);
    expect(DIM_OPACITY).toBeLessThan(1);
    expect(FLOAT_ALPHA).toBeGreaterThan(0);
    expect(FLOAT_ALPHA).toBeLessThan(1);
    expect(FLOAT_SURFACE).toBe(FLOAT_OPAQUE);
    expect(INSPECTOR_SURFACE).toBe("--background");
  });

  /**
   * The outline is drawn INSIDE the column's box. An outset one on a
   * `h-safe-dvh` column is clipped by the window edge on three sides, which
   * reads as a stray hairline rather than as a frame around the screen.
   */
  it("draws the editing outline inside the column, where nothing can clip it", () => {
    expect(EDITING_OUTLINE_RULE?.selector).toContain(
      '[data-layout-editing="1"]',
    );
    expect(Number.parseFloat(EDITING_OUTLINE_OFFSET)).toBeLessThan(0);
  });

  /** One signal, so the tab's cap and the screen's outline are one token. */
  it("paints the sample tab and the editing outline from the same token", () => {
    expect(SAMPLE_TAB_COLOR).toBe(EDITING_OUTLINE);
  });

  /**
   * The guide's lit moment (L-50) is the same dim with no session behind it,
   * so it has to be the same DECLARATIONS - not a second set that can drift
   * into a different treatment under the same name.
   */
  it("gives the lit moment the session's own dim", () => {
    expect(DIM_RULE).toBeDefined();
    expect(DIM_RULE?.selector).toContain('[data-layout-editing="1"]');
    expect(DIM_RULE?.selector).toContain('[data-layout-lit="1"]');
  });
});

describe("the canvas decoration across every built-in palette", () => {
  it("holds 3:1 for the hover outline on every surface", () => {
    expect(
      violations((palette, need) => {
        onSurfaces(palette, need, "hover outline", () =>
          themeToken(palette.tokens, HOVER_OUTLINE),
        );
      }),
    ).toEqual([]);
  });

  /**
   * The editing mode's own colour, measured as what it IS: a 2px dotted
   * outline around the app column and a 1.5px cap on the sample tab, both
   * non-text indicators owing 3:1 (1.4.11). `--warning` is the tint of the
   * status pair and is a mid amber in the light palettes, which is why the
   * pair's FOREGROUND is what ships here - the same reason L-78 took
   * `--foreground` over `--ring` for the selection outline.
   *
   * Both halves land on the same surfaces: the tab strip sits on the app's
   * header and the outline runs around a column that can show any of them.
   */
  it("holds 3:1 for the editing outline and the sample tab's cap", () => {
    expect(
      violations((palette, need) => {
        onSurfaces(palette, need, "editing outline", () =>
          themeToken(palette.tokens, EDITING_OUTLINE),
        );
        onSurfaces(palette, need, "sample tab cap", () =>
          themeToken(palette.tokens, SAMPLE_TAB_COLOR),
        );
      }),
    ).toEqual([]);
  });

  /**
   * The ring is several bands and the user sees the widest visible one, so
   * what it owes is that AT LEAST ONE solid band clears the floor on every
   * surface - not that its accent does. `--ring` alone does not: it is a soft
   * grey in this app's light palettes and measures 2.02:1 on `ayu/light`.
   */
  it("gives the travelling ring a band clear of 3:1 on every surface", () => {
    const failures: string[] = [];
    for (const palette of PALETTES) {
      for (const surface of SURFACES) {
        const ground = themeToken(palette.tokens, `--${surface}`);
        const best = Math.max(
          ...RING_BANDS.map((band) =>
            contrastRatio(themeToken(palette.tokens, band), ground),
          ),
        );
        if (best < NON_TEXT) {
          failures.push(
            `${palette.label} ring on ${surface}: best band ${best.toFixed(2)} < ${NON_TEXT}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The halo is the ring's outer, translucent band and the only thing
   * `prefers-reduced-transparency` drops. That is safe exactly because the
   * solid bands inside it carry the whole signal, so the fallback has to keep
   * every one of them.
   */
  it("keeps every solid band when the halo is dropped for reduced transparency", () => {
    const reducedRing = cssValue(
      under("prefers-reduced-transparency", (selector) =>
        selector.includes("[data-layout-selection-ring]"),
      ),
      "box-shadow",
    );
    expect(solidShadowTokens(reducedRing)).toEqual([...RING_BANDS]);
    expect(reducedRing).not.toContain("color-mix");
  });

  it("holds 4.5:1 for the name chip's text on its own fill", () => {
    expect(
      violations((palette, need) =>
        need(
          "chip text",
          themeToken(palette.tokens, CHIP_TEXT),
          themeToken(palette.tokens, CHIP_FILL),
          TEXT,
        ),
      ),
    ).toEqual([]);
  });

  /**
   * A ghost is the answer to "what is hidden here", and it appears among
   * leaves the session has already dimmed. Quieter than those, it is a
   * preview nobody finds - so the one thing it owes, on every palette, is to
   * be no fainter than the calm around it. Measured rather than compared as
   * two numbers, because the two opacities composite over different colours
   * once a palette's foreground is not pure black or white.
   */
  it("never draws a ghost fainter than the calm chrome around it", () => {
    const failures: string[] = [];
    for (const palette of PALETTES) {
      for (const surface of SURFACES) {
        const ground = themeToken(palette.tokens, `--${surface}`);
        const ink = themeToken(palette.tokens, "--foreground");
        const ghost = contrastRatio(
          compositeOverBackground(ink, GHOST_OPACITY, ground),
          ground,
        );
        const dimmed = contrastRatio(
          compositeOverBackground(ink, DIM_OPACITY, ground),
          ground,
        );
        if (ghost < dimmed) {
          failures.push(
            `${palette.label} ${surface}: ghost ${ghost.toFixed(2)} < dimmed ${dimmed.toFixed(2)}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The Amoled guard. A 35% black scrim clears every ratio above and is
   * INVISIBLE on a black canvas, because it composites a colour that is
   * already there. An opacity cannot: it moves the leaf towards its own
   * surface whatever that surface is, so the lit chrome beside it always
   * stands off the dimmed chrome by a real margin.
   */
  it("is visibly a dim in every palette, blackest included", () => {
    const failures: string[] = [];
    for (const palette of PALETTES) {
      for (const surface of SURFACES) {
        const ground = themeToken(palette.tokens, `--${surface}`);
        const foreground = themeToken(palette.tokens, "--foreground");
        const lit = contrastRatio(foreground, ground);
        const dimmed = contrastRatio(
          compositeOverBackground(foreground, DIM_OPACITY, ground),
          ground,
        );
        if (dimmed >= lit * 0.7) {
          failures.push(
            `${palette.label} ${surface}: dimmed ${dimmed.toFixed(2)} vs lit ${lit.toFixed(2)}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("the floating inspector's material", () => {
  it("holds 4.5:1 for body and muted text over every surface it can float above", () => {
    expect(
      violations((palette, need) => {
        for (const surface of SURFACES) {
          const behind = themeToken(palette.tokens, `--${surface}`);
          const material = compositeOverBackground(
            themeToken(palette.tokens, FLOAT_SURFACE),
            FLOAT_ALPHA,
            behind,
          );
          need(
            `body text over ${surface}`,
            themeToken(palette.tokens, "--card-foreground"),
            material,
            TEXT,
          );
          need(
            `muted text over ${surface}`,
            themeToken(palette.tokens, "--muted-foreground"),
            material,
            TEXT,
          );
        }
      }),
    ).toEqual([]);
  });

  it("holds 4.5:1 on the opaque card the reduced-transparency fallback becomes", () => {
    expect(
      violations((palette, need) => {
        const card = themeToken(palette.tokens, FLOAT_OPAQUE);
        need(
          "body text",
          themeToken(palette.tokens, "--card-foreground"),
          card,
          TEXT,
        );
        need(
          "muted text",
          themeToken(palette.tokens, "--muted-foreground"),
          card,
          TEXT,
        );
      }),
    ).toEqual([]);
  });

  it("holds 4.5:1 on the docked inspector's own surface", () => {
    expect(
      violations((palette, need) => {
        const panel = themeToken(palette.tokens, INSPECTOR_SURFACE);
        need(
          "body text",
          themeToken(palette.tokens, "--foreground"),
          panel,
          TEXT,
        );
        need(
          "muted text",
          themeToken(palette.tokens, "--muted-foreground"),
          panel,
          TEXT,
        );
      }),
    ).toEqual([]);
  });
});
