/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The half of the entry and exit motion that only CSS can state (L-30, 5.2).
 *
 * `editor-motion.ts` decides WHETHER a transition runs and its unit test
 * covers that; what no jsdom test can observe is which elements the browser
 * then snapshots, because jsdom runs no view transition at all. The rules
 * below are the ones a wrong stylesheet breaks silently - a name that outlives
 * its transition, a second gate that is missing, a group the transcript joined
 * by accident, an old snapshot that squashes instead of cropping - so they are
 * asserted against the stylesheet itself.
 *
 * The pairing with `app-shell.tsx` is here for the same reason: the column's
 * marker and the selector that names it are one mechanism written in two
 * files, and a rename on either side leaves a rule that matches nothing.
 */

const SOURCE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(relativePath: string): string {
  return readFileSync(path.join(SOURCE_DIR, relativePath), "utf8");
}

const css = read("components/layout-editor/layout-editor.css");

/** The body of the one `prefers-reduced-motion: no-preference` block. */
function noPreferenceBlock(): string {
  const match =
    /@media \(prefers-reduced-motion: no-preference\) \{\n([\s\S]*?)\n\}/.exec(
      css,
    );
  if (match === null) throw new Error("no no-preference media block");
  return match[1];
}

describe("the named groups (5.2, C-14)", () => {
  it("names exactly two groups, so the transcript is never snapshotted twice", () => {
    const declared = css.match(/view-transition-name: ([a-z-]+);/g) ?? [];

    expect(declared).toEqual([
      "view-transition-name: layout-shell;",
      "view-transition-name: layout-inspector;",
    ]);
  });

  it("names them behind both reduced-motion gates and only while one runs", () => {
    const gated = noPreferenceBlock();

    expect(gated).toContain("view-transition-name: layout-shell");
    expect(gated).toContain("view-transition-name: layout-inspector");
    // The names are conditional on the attribute `editor-motion.ts` holds for
    // the life of the transition, so nothing is named at rest.
    const rules = gated.match(/:root\[data-layout-transition\][^{]*\{/g) ?? [];
    expect(rules).toHaveLength(2);
    rules.forEach((rule) => {
      expect(rule).toContain(":not([data-reduce-panel-motion])");
    });
  });

  it("names the column the shell markup actually carries", () => {
    expect(noPreferenceBlock()).toContain("[data-layout-column]");
    expect(read("components/layout/app-shell.tsx")).toContain(
      "data-layout-column",
    );
  });
});

describe("what the groups animate (section 6)", () => {
  it("crops the old shell snapshot rather than squashing it (C-14)", () => {
    const shellImages =
      /::view-transition-old\(layout-shell\),\n::view-transition-new\(layout-shell\) \{\n([\s\S]*?)\n\}/.exec(
        css,
      );

    expect(shellImages?.[1]).toContain("object-fit: cover");
    expect(shellImages?.[1]).toContain("object-position: left top");
  });

  it("leaves the editor faster than it arrives", () => {
    expect(css).toContain(
      "::view-transition-new(layout-inspector) {\n  animation: layout-inspector-in 220ms",
    );
    expect(css).toContain(
      "::view-transition-old(layout-inspector) {\n  animation: layout-inspector-out 140ms",
    );
    expect(css).toContain(
      '[data-layout-inspector][data-exiting="1"] {\n  animation: layout-inspector-out 140ms',
    );
  });
});
