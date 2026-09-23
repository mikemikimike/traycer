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
interface PlanLeafSet {
  /** The item as the plan's 4.2 enumerates it, verbatim enough to find. */
  readonly item: string;
  /** Marker count per file, or `{}` for an item this tree has no leaf for. */
  readonly files: Readonly<Record<string, number>>;
  /** Why an item carries no marker. `null` for an item that does. */
  readonly deviation: string | null;
}

/**
 * Plan 4.2's enumerated leaf set, item by item.
 *
 * Written from the PLAN and not from the tree, which is the point: the
 * previous version of this constant was read off the implementation and then
 * asserted back against a grep of that same implementation, so the two items
 * the plan names and the tree does not have could never fail it (G1-18). An
 * item with no leaf is present here with its reason, so a reader comparing
 * this file with the plan sees the gap rather than having to notice an
 * absence.
 */
const PLAN_4_2: ReadonlyArray<PlanLeafSet> = [
  {
    // The vertical strip is the same item in its other presentation (D6):
    // history and the bell become the Inbox and All tasks nav rows, one
    // marker on their shared row button, and identity becomes the foot's
    // account row, the user menu's trigger there. The update control draws
    // one marker per layout: the header's icon, and the foot's row.
    item: "app-header.tsx: history nav, update, history, bell, identity - but NOT HeaderBarCluster",
    files: {
      "components/layout/header/history-nav-buttons.tsx": 1,
      "components/layout/header/app-update-button.tsx": 2,
      "components/layout/header/history-button.tsx": 1,
      "components/notifications/notifications-bell.tsx": 1,
      "components/auth/user-menu.tsx": 1,
      // F7 moved the add button here as New Task, with its own leaf marker.
      "components/layout/tabs/side-strip/side-strip-nav-rows.tsx": 2,
      "components/layout/tabs/side-strip/side-strip-foot.tsx": 1,
    },
    deviation: null,
  },
  {
    // The tab strip's one marker is the `-members` spelling, which dims each
    // tab rather than the scroller's own box: one of those tabs carries the
    // amber cap that says which tab is being customized, and `opacity` on an
    // ancestor cannot be undone below it (L-132). It is counted here because
    // it is the same marker in the same place - what changed is which box the
    // dim lands on, and the leaf rule is exactly why it had to change.
    // The vertical strip is the same item in its other presentation: its row
    // list dims each row the same way, and its collapse toggle sits beside
    // the shared add button.
    item: "tab-strip.tsx: the tab items and the add button, not the Home item",
    files: {
      "components/layout/tabs/tab-strip.tsx": 1,
      "components/layout/tabs/tab-strip-new-button.tsx": 1,
      "components/layout/tabs/side-strip/side-strip-row-list.tsx": 1,
      "components/layout/tabs/side-strip/side-strip-top-block.tsx": 1,
    },
    deviation: null,
  },
  {
    item: "chat-messages.tsx: the transcript body, not the minimap",
    files: { "components/chat/chat-timeline.tsx": 1 },
    deviation: null,
  },
  {
    item: "the composer input and send button, and the composer foot's workspace label",
    files: {
      "components/home/composer/composer-shell.tsx": 1,
      "components/home/composer/composer-send-button.tsx": 2,
      "components/home/host-workspace-selector/host-workspace-selector.tsx": 1,
      // Two, and the second belongs to the item above: under L-87 the sample
      // workspace IS the canvas, so its own transcript scroller takes the
      // `opacity-only` marker `chat-timeline.tsx` carries for the real one
      // (C-03). Counted here rather than there because the reduce below is a
      // last-one-wins merge, and one file cannot be split across two items.
      "components/sample-workspace/sample-workspace-body.tsx": 2,
    },
    deviation: null,
  },
  {
    item: "app-status-bar.tsx: the refresh affordance",
    files: {
      "components/layout/status-bar/status-bar-rate-limit-cluster.tsx": 1,
      "components/layout/status-bar/app-status-bar.tsx": 2,
    },
    deviation: null,
  },
  {
    item: "app-status-bar.tsx: the spacers",
    files: {},
    deviation:
      "The strip has no spacer leaf. Its one growing box is the usage slot " +
      "(`status-bar-rate-limit-slot`), which CONTAINS the usageLimits region, " +
      "so a `filter` on it would dim the region - the exact inversion the " +
      "leaf-level rule exists to prevent. The only non-region children left " +
      "are the two host notices, which take the segments' slot and are " +
      "marked above.",
  },
  {
    item: "epic-sidebar-rail.tsx: the non-panel chrome",
    files: {},
    deviation:
      "The rail has no non-panel chrome. Every child is a RailPanelButton, " +
      "which IS a region, plus the transient drop previews that exist only " +
      "during a drag; the rail container itself is an ancestor of all nine " +
      "regions. Marking anything here would dim the regions.",
  },
  {
    item: "epic-sidebar.tsx: the panel body",
    files: { "components/epic-canvas/sidebar/epic-sidebar.tsx": 2 },
    deviation: null,
  },
  // The two items L-87 adds: the sample workspace IS the canvas now, so its
  // own non-region chrome owes the same dim the real shell's does (C-03).
  {
    item: "sample-workspace-surface.tsx: the sample banner",
    files: { "components/sample-workspace/sample-workspace-surface.tsx": 1 },
    deviation: null,
  },
  {
    item: "sample-workspace-rail.tsx: the sample rail's non-editable container",
    files: {},
    deviation:
      "The sample rail has no non-region element, for the same reason " +
      "`epic-sidebar-rail.tsx` above has none: every node in it - the " +
      "`<aside>`, each group box - is an ANCESTOR of the rail tiles, and each " +
      "tile is one of the nine rail regions. A marker on any of them would " +
      "dim the regions, which is the inversion this registry exists to stop.",
  },
];

const PASSIVE_LEAVES: Readonly<Record<string, number>> = PLAN_4_2.reduce<
  Record<string, number>
>((leaves, entry) => ({ ...leaves, ...entry.files }), {});

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

  it("states a reason for every plan item this tree has no leaf for", () => {
    for (const entry of PLAN_4_2) {
      const hasFiles = Object.keys(entry.files).length > 0;
      expect(hasFiles || entry.deviation !== null, entry.item).toBe(true);
      // And the converse: an item that IS marked must not also claim a
      // deviation, or the record says two things at once.
      expect(hasFiles && entry.deviation !== null, entry.item).toBe(false);
    }
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
