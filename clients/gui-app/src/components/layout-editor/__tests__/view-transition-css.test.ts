/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The half of the entry and exit motion that only CSS can state (L-30, 5.2).
 *
 * Everything here compares two INDEPENDENT artefacts: the stylesheet against
 * the rule L-30 states (exactly two named groups, a third of which would put
 * the streaming transcript in a snapshot of its own), against `app-shell.tsx`'s
 * own marker, and against the attribute value `editor-motion.ts` writes. A rule
 * written out again as an exact source string is not one of those - it fails a
 * correct stylesheet on a formatter reflow and passes a wrong one that kept the
 * spelling, which is how G2-01 lived in this file with this suite green on it.
 * What those pins were reaching for is the owner's live pass, which plan 5.2
 * already books.
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

  it("matches the attribute by token, because it carries two (L-66)", () => {
    // `editor-motion.ts` writes "<phase> <side>", so a rule spelled `=` would
    // quietly stop matching the moment the phase joined the side - and a
    // stylesheet that matches nothing fails silently by construction.
    const valued =
      css.match(/\[data-layout-transition[~^|*$]?=[^\]]*\]/g) ?? [];

    expect(valued.length).toBeGreaterThan(0);
    valued.forEach((selector) => {
      expect(selector.startsWith("[data-layout-transition~=")).toBe(true);
    });
    // And the exit is addressable at all, which is the whole reason the phase
    // is on the attribute; `editor-motion.test.ts` pins the value written.
    expect(valued.some((selector) => selector.includes("exit"))).toBe(true);
  });

  it("silences the panel's own slide for a panel that arrived in a snapshot (G2-01)", () => {
    // The other half of a mechanism written in two files: `editor-motion.ts`
    // stamps `data-entered` on the panel it hands to a view transition, and the
    // stylesheet is what has to stop `layout-inspector-in` from starting on it.
    // Unconsumed, the stamp is inert and the panel slides in a second time the
    // moment the transition's names come off.
    const entered =
      /\[data-layout-inspector\]\[data-entered\][^{]*\{([^}]*)\}/.exec(css);

    expect(entered?.[1]).toContain("animation: none");
  });
});
