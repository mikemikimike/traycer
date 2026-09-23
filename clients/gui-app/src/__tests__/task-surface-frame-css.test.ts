/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The sheet-shell surface frames (ticket 02), asserted on the stylesheet's
 * text: jsdom applies no Tailwind utilities, so the margin/border/radius a
 * sheet owes cannot be read back from computed style.
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
  return bracedBody(start + head.length);
}

/** The `{ ... }` body starting right after an already-consumed opening brace. */
function bracedBody(afterOpenBrace: number): string {
  let depth = 1;
  let index = afterOpenBrace;
  while (depth > 0 && index < css.length) {
    const char = css[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    index += 1;
  }
  return css.slice(afterOpenBrace, index - 1);
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

/**
 * The declarations before any nested rule opens, whitespace collapsed.
 * Stops at the last `;` before the first `{` - the text between that `;` and
 * the `{` is the nested rule's own selector, not a top-level declaration.
 */
function topLevelDeclarations(body: string): string {
  const firstBrace = body.indexOf("{");
  const head = firstBrace === -1 ? body : body.slice(0, firstBrace);
  const lastSemicolon = head.lastIndexOf(";");
  return (lastSemicolon === -1 ? head : head.slice(0, lastSemicolon + 1))
    .replace(/\s+/g, " ")
    .trim();
}

describe.each([
  "task-surface-frame-beside-left",
  "task-surface-frame-beside-right",
])("%s", (name) => {
  it("no longer exists: every placement composes the same plain task-surface-frame", () => {
    // The beside utilities carried no geometry of their own (they just
    // `@apply task-surface-frame`), so the placement-specific wrapper was
    // pure duplication; callers now put `task-surface-frame` on the surface
    // frame directly for every placement.
    expect(css.includes(`@utility ${name} {`)).toBe(false);
  });
});

describe("task-surface-frame", () => {
  const body = utilityBody("task-surface-frame");
  const rules = nestedRules(body);

  it("insets the sheet from the ground by --shell-gap on every edge", () => {
    // A single `margin` shorthand, not four longhands: the sheet insets
    // uniformly on all four edges (D1/D2), replacing the old top-only tuck.
    expect(topLevelDeclarations(body)).toBe("margin: var(--shell-gap);");
  });

  it("gives every sheet descendant the sheet radius and a 1px canvas border", () => {
    const declarations = rules.get("& [data-shell-sheet]");
    expect(declarations).toBeDefined();
    expect(declarations).toContain("border: 1px solid var(--canvas-border);");
    expect(declarations).toContain("border-radius: var(--radius-xl);");
  });

  it("paints a single-sheet (non-epic) route in --canvas", () => {
    // Home/History/Settings mount `data-shell-sheet="route"` on their own
    // wrapper (`TopLevelSurfaceMount`); the epic surface paints its own two
    // sheets (`panel`/`content`) itself and does not rely on this fill.
    expect(rules.get('& [data-shell-sheet="route"]')).toBe(
      "background-color: var(--canvas);",
    );
  });

  it("carries no leftover top-only concave-corner tricks", () => {
    // The old contract clipped a rounded top corner OUT of the frame with
    // `::before`/`::after` pseudo-elements; the sheet is a real bordered box
    // now, drawn by the `[data-shell-sheet]` descendant rule above.
    expect(body).not.toContain("::before");
    expect(body).not.toContain("::after");
    expect(body).not.toContain("content:");
    expect(body).not.toContain("margin-top: -1px");
  });
});

describe("[data-browser-guest-sheet]", () => {
  it("clips a portalled browser guest to the sheet radius under md, leaving mobile unclipped", () => {
    const head = "[data-browser-guest-sheet] {";
    const start = css.indexOf(head);
    if (start === -1) throw new Error("no [data-browser-guest-sheet] rule");
    const body = bracedBody(start + head.length)
      .replace(/\s+/g, " ")
      .trim();

    expect(body).toContain("@variant md");
    expect(body).toContain(
      "clip-path: inset(1px round calc(var(--radius-xl) - 1px));",
    );
  });
});
