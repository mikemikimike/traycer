/// <reference types="node" />

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The passive dim's one rule, kept as a registry (4.2).
 *
 * `layout-editor.css` puts `opacity` and `filter` on every
 * `[data-layout-passive]` inside the editing column, and a `filter` on an
 * ancestor of a region dims the region too - which inverts the whole signal,
 * since the point is that editable chrome reads as LIT against calm content.
 * The marker therefore belongs on individual LEAVES, and whether a given
 * element is a leaf is a fact about the tree it sits in, which no scan can
 * decide.
 *
 * So the gate is a list: the marker set is declared here, from the enumerated
 * leaf set in the plan's 4.2, and a marker that appears anywhere else fails
 * this test. Adding one is then a deliberate act with a place to record the
 * reason, rather than a line that slips in above a region.
 *
 * `className="contents"` wrappers are excluded for a second reason: they
 * generate no box at all, so `opacity` and `filter` on them are silent no-ops
 * - the failure mode that made the old `data-customize-inert` markers useless.
 */
const PASSIVE_LEAVES: Readonly<Record<string, number>> = {
  // Top bar: everything in the header's clusters except `HeaderUsageControls`,
  // which IS a region, and the Home item, which is one too.
  "components/layout/header/history-nav-buttons.tsx": 1,
  "components/layout/header/app-update-button.tsx": 3,
  "components/layout/header/history-button.tsx": 1,
  "components/notifications/notifications-bell.tsx": 1,
  "components/auth/user-menu.tsx": 1,
  "components/layout/tabs/tab-strip.tsx": 1,
  "components/layout/tabs/tab-strip-new-button.tsx": 1,
  // Chat: the transcript body, never the container that also holds the
  // minimap's region.
  "components/chat/chat-timeline.tsx": 1,
  // Composer: the message box and the send/stop control. The toolbar beneath
  // them is where the composer's regions live and is deliberately absent.
  "components/home/composer/composer-shell.tsx": 1,
  "components/home/composer/composer-send-button.tsx": 2,
  "components/home/host-workspace-selector/host-workspace-selector.tsx": 1,
  "components/sample-workspace/sample-workspace-body.tsx": 1,
  // Status bar: the refresh affordance and the host notice that takes the
  // usage segments' slot.
  "components/layout/status-bar/status-bar-rate-limit-cluster.tsx": 1,
  "components/layout/status-bar/app-status-bar.tsx": 2,
  // Sidebar: the panel body. The rail is its sibling, and every icon on the
  // rail is a region, so the rail carries no marker at all.
  "components/epic-canvas/sidebar/epic-sidebar.tsx": 2,
};

const SRC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const MARKER = /data-layout-passive/g;

describe("the passive dim's marker set", () => {
  it("is exactly the leaf set 4.2 enumerates", () => {
    expect(markerCounts()).toEqual(PASSIVE_LEAVES);
  });

  it("never marks a `contents` wrapper, which generates no box to dim", () => {
    for (const relative of Object.keys(PASSIVE_LEAVES)) {
      const source = readFileSync(path.join(SRC_DIR, relative), "utf8");
      for (const line of source.split("\n")) {
        if (!line.includes("data-layout-passive")) continue;
        expect(line).not.toContain('"contents"');
      }
    }
  });
});

function markerCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of sourceFiles(SRC_DIR)) {
    const hits = readFileSync(file, "utf8").match(MARKER);
    if (hits === null) continue;
    counts[path.relative(SRC_DIR, file)] = hits.length;
  }
  return counts;
}

function sourceFiles(dir: string): ReadonlyArray<string> {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      files.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
  }
  return files;
}
