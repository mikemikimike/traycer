/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The beside-strip surface frames, asserted on the stylesheet's text: jsdom
 * applies no Tailwind utilities, so the tuck cannot be read back from computed
 * style.
 */

const css = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "index.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of `@utility <name> { ... }`, braces matched. */
function utilityBody(name: string): string {
  const head = `@utility ${name} {`;
  const start = css.indexOf(head);
  if (start === -1) throw new Error(`no @utility ${name}`);
  let depth = 1;
  let index = start + head.length;
  while (depth > 0 && index < css.length) {
    const char = css[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    index += 1;
  }
  return css.slice(start + head.length, index - 1);
}

/** Each nested rule in a utility body: selector to declarations, whitespace collapsed. */
function nestedRules(body: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const flat = body
    .replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")");
  for (const match of flat.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    map.set(match[1].trim(), match[2].trim());
  }
  return map;
}

// The band is displayed under a window-controls overlay, or while it carries
// the desktop menus (`data-title-band-menus="active"`); only then does the surface
// tuck up onto its hairline.
const DISPLAYED_BAND_TUCK =
  ':is(.wco [data-app-title-band="band"], [data-app-title-band="band"]:has(> [data-title-band-menus="active"])) &';

describe.each([
  "task-surface-frame-beside-left",
  "task-surface-frame-beside-right",
])("%s", (name) => {
  const rules = nestedRules(utilityBody(name));

  it("tucks 1px up only under a displayed title band", () => {
    expect(rules.get(DISPLAYED_BAND_TUCK)).toBe("margin-top: -1px;");
  });

  it("has no other tuck rule keyed on the band attribute alone", () => {
    const tuckSelectors = [...rules.entries()]
      .filter(([, declarations]) => declarations.includes("margin-top"))
      .map(([selector]) => selector);
    expect(tuckSelectors).toEqual([DISPLAYED_BAND_TUCK]);
  });
});
