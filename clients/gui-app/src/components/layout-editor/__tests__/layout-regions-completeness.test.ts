import { describe, expect, it } from "vitest";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import {
  quickVerbLabel,
  quickVerbToast,
} from "@/components/layout-editor/regions/quick-verbs";
import {
  LAYOUT_REGION_IDS,
  regionFacts,
  regionStateWord,
} from "@/components/layout-editor/regions/region-facts";
import {
  fineTuneMatchesFilter,
  regionMatchesFilter,
} from "@/components/layout-editor/regions/region-filter-match";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import {
  positionRowChanged,
  revertPositionRow,
} from "@/components/layout-editor/regions/region-position-rows";
import {
  type LayoutOverrides,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import {
  effectiveLayoutValues,
  PRESET_VALUES,
  SHIPPED_DEFAULT_VALUES,
} from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import { DEFAULT_LAYOUT_SNAPSHOT } from "@/stores/layout/layout-store";

/**
 * What the registry owes every caller that walks it.
 *
 * The reverse direction - a grammar row naming a key its region does not have
 * - is a compile error by construction (C-20), so it is deliberately not
 * tested here.
 */

/** The state words the vocabulary allows (L-33, L-47). Nothing else may appear. */
const STATE_WORDS: ReadonlyArray<string> = [
  "Shown",
  "Hidden",
  "Auto",
  "Chip",
  "Full row",
  "Left",
  "Right",
  "Status bar",
  "Header",
  "Text",
  "Ring",
  "Ring only",
  "Bars",
  "Bars + text",
];

/**
 * `shown` is the header's own switch rather than a grammar row (L-08), so it
 * is the one leaf a section does not reach through `rows`.
 */
const HEADER_KEY = "shown";

const EVERY_REGION_HIDDEN: LayoutOverrides = {
  homeTab: { shown: "hidden" },
  usageLimits: { shown: "hidden" },
  resourceMonitor: { shown: "hidden" },
  minimap: { shown: "hidden" },
  contextUsage: { shown: "hidden" },
  runningAgents: { shown: "hidden" },
  changedFiles: { shown: "hidden" },
  background: { shown: "hidden" },
  attachImage: { shown: "hidden" },
  access: { shown: "hidden" },
  agent: { shown: "hidden" },
  model: { shown: "hidden" },
  mic: { shown: "hidden" },
  railAgents: { shown: "hidden" },
  railTerminals: { shown: "hidden" },
  railBrowsers: { shown: "hidden" },
  railArtifacts: { shown: "hidden" },
  railGitDiff: { shown: "hidden" },
  railPullRequests: { shown: "hidden" },
  railFileTree: { shown: "hidden" },
  railSharing: { shown: "hidden" },
  railComments: { shown: "hidden" },
};

/** Every value set a preset or the Shown switch can put a region in. */
const REACHABLE_VALUES: ReadonlyArray<LayoutValues> = [
  PRESET_VALUES.default,
  PRESET_VALUES.compact,
  PRESET_VALUES.detailed,
  effectiveLayoutValues("default", EVERY_REGION_HIDDEN),
];

const MOVED_ARRANGEMENT = {
  ...DEFAULT_ARRANGEMENT,
  usageHost: "header" as const,
  resourceSide: "left" as const,
  minimapSide: "left" as const,
};

/** Which value keys a region's grammar rows can write. */
function keysReachableFromRows(region: RegionId): ReadonlyArray<string> {
  const entry = LAYOUT_REGIONS[region];
  return entry.rows.flatMap((row): string[] => {
    if (row.kind === "size") return ["size"];
    if (row.kind === "style") {
      return row.examples.flatMap((example) => Object.keys(example.patch));
    }
    if (row.kind === "fine-tune") {
      return row.rows.flatMap((fineTuneRow): string[] => {
        const control = fineTuneRow.control;
        return control.kind === "checks" ? [...control.keys] : [control.key];
      });
    }
    return [];
  });
}

describe("the region registry covers every region", () => {
  it("lists all twenty-two regions, grouped by surface", () => {
    expect(LAYOUT_REGION_IDS).toHaveLength(22);
    expect(new Set(LAYOUT_REGION_IDS).size).toBe(22);
    const surfaceOrder = LAYOUT_REGION_IDS.map(
      (id) => regionFacts(id).surface,
    ).map((surface) =>
      SURFACE_GROUPS.findIndex((group) => group.id === surface),
    );
    expect(surfaceOrder).toEqual([...surfaceOrder].sort((a, b) => a - b));
    expect(surfaceOrder).not.toContain(-1);
  });

  it("gives every region a name, a place and something to search it by", () => {
    for (const id of LAYOUT_REGION_IDS) {
      const entry = regionFacts(id);
      expect(entry.name.length, id).toBeGreaterThan(0);
      expect(entry.where.length, id).toBeGreaterThan(0);
      expect(entry.keywords.length, id).toBeGreaterThan(0);
      expect(regionMatchesFilter(id, entry.name), id).toBe(true);
      for (const keyword of entry.keywords) {
        expect(regionMatchesFilter(id, keyword), `${id}:${keyword}`).toBe(true);
      }
    }
  });

  it("names the rail panels after the sidebar's own titles", () => {
    expect(regionFacts("railAgents").name).toBe("Agents");
    expect(regionFacts("railPullRequests").name).toBe("Pull Requests");
    expect(regionFacts("railGitDiff").name).toBe("Git Diff");
  });

  it("spells out the presence rule only where a panel has one", () => {
    expect(regionFacts("railPullRequests").hint).toBe(
      "Auto - appears when this repo has pull requests",
    );
    expect(regionFacts("railComments").hint).toBe(
      "Auto - appears when an artifact is open",
    );
    for (const id of ["railAgents", "railTerminals", "railFileTree"] as const) {
      expect(regionFacts(id).hint, id).toBeNull();
    }
  });
});

describe("every value leaf is reachable from a row", () => {
  it("leaves nothing but the header's own switch off the grammar", () => {
    for (const id of LAYOUT_REGION_IDS) {
      const leaves = Object.keys(SHIPPED_DEFAULT_VALUES[id]).filter(
        (key) => key !== HEADER_KEY,
      );
      const reachable = new Set(keysReachableFromRows(id));
      for (const leaf of leaves) {
        expect(reachable.has(leaf), `${id}.${leaf}`).toBe(true);
      }
    }
  });

  it("pairs each metric check with the key it writes", () => {
    const fineTune = LAYOUT_REGIONS.resourceMonitor.rows.find(
      (row) => row.kind === "fine-tune",
    );
    expect(fineTune?.kind).toBe("fine-tune");
    const control =
      fineTune?.kind === "fine-tune" ? fineTune.rows[0].control : null;
    expect(control?.kind).toBe("checks");
    if (control?.kind !== "checks") return;
    expect(control.options.map((option) => option.value)).toEqual([
      ...control.keys,
    ]);
    expect(control.options.map((option) => option.label)).toEqual([
      "CPU",
      "Memory",
      "Processes",
      "RAM share",
    ]);
  });
});

describe("state words", () => {
  it("stays inside the vocabulary for every reachable combination", () => {
    for (const id of LAYOUT_REGION_IDS) {
      for (const values of REACHABLE_VALUES) {
        for (const arrangement of [DEFAULT_ARRANGEMENT, MOVED_ARRANGEMENT]) {
          const word = regionStateWord(id, values, arrangement);
          expect(STATE_WORDS, `${id}: ${word}`).toContain(word);
        }
      }
    }
  });

  it("says Hidden wherever the region is switched off", () => {
    const hidden = effectiveLayoutValues("default", EVERY_REGION_HIDDEN);
    for (const id of LAYOUT_REGION_IDS) {
      expect(regionStateWord(id, hidden, DEFAULT_ARRANGEMENT), id).toBe(
        "Hidden",
      );
    }
  });

  it("reads the position out of the arrangement, not out of the values", () => {
    const values = PRESET_VALUES.default;
    expect(regionStateWord("usageLimits", values, DEFAULT_ARRANGEMENT)).toBe(
      "Status bar",
    );
    expect(regionStateWord("usageLimits", values, MOVED_ARRANGEMENT)).toBe(
      "Header",
    );
    expect(regionStateWord("minimap", values, DEFAULT_ARRANGEMENT)).toBe(
      "Right",
    );
    expect(regionStateWord("minimap", values, MOVED_ARRANGEMENT)).toBe("Left");
    expect(regionStateWord("resourceMonitor", values, MOVED_ARRANGEMENT)).toBe(
      "Left",
    );
  });

  it("distinguishes the density readings a preset produces", () => {
    expect(
      regionStateWord(
        "runningAgents",
        PRESET_VALUES.compact,
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe("Chip");
    expect(
      regionStateWord(
        "runningAgents",
        PRESET_VALUES.default,
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe("Full row");
    expect(
      regionStateWord("model", PRESET_VALUES.detailed, DEFAULT_ARRANGEMENT),
    ).toBe("Bars + text");
    expect(
      regionStateWord(
        "contextUsage",
        PRESET_VALUES.compact,
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe("Ring only");
    expect(
      regionStateWord(
        "railPullRequests",
        PRESET_VALUES.default,
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe("Auto");
  });
});

describe("quick verbs", () => {
  it("offers chip and full exactly where a Size row exists", () => {
    for (const id of LAYOUT_REGION_IDS) {
      const entry = regionFacts(id);
      const sized = entry.rows.some((row) => row.kind === "size");
      expect(entry.quickVerbs.includes("chip"), id).toBe(sized);
      expect(entry.quickVerbs.includes("full"), id).toBe(sized);
    }
  });

  it("names the region in the copy that reads better with it", () => {
    expect(quickVerbLabel("hide", "Minimap")).toBe("Hide Minimap");
    expect(quickVerbLabel("chip", "Access")).toBe("Show as chip");
    expect(quickVerbToast("chip", "Access")).toBe("Access is a chip");
    expect(quickVerbToast("full", "Access")).toBe("Access is a full row");
  });
});

describe("the filter", () => {
  it("matches a fine-tune label only as a fine-tune match", () => {
    expect(regionMatchesFilter("usageLimits", "time until reset")).toBe(false);
    expect(fineTuneMatchesFilter("usageLimits", "time until reset")).toBe(true);
    expect(fineTuneMatchesFilter("homeTab", "time until reset")).toBe(false);
  });

  it("matches everything on an empty query and nothing inside Fine-tune", () => {
    expect(regionMatchesFilter("homeTab", "   ")).toBe(true);
    expect(fineTuneMatchesFilter("usageLimits", "   ")).toBe(false);
  });
});

describe("the Position row against the default arrangement (L-57)", () => {
  it("is unchanged on the shipped arrangement", () => {
    for (const id of LAYOUT_REGION_IDS) {
      expect(positionRowChanged(DEFAULT_LAYOUT_SNAPSHOT, id), id).toBe(false);
    }
  });

  it("notices a host, a side and an order move on the region that owns it", () => {
    const moved = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: MOVED_ARRANGEMENT,
    };
    expect(positionRowChanged(moved, "usageLimits")).toBe(true);
    expect(positionRowChanged(moved, "minimap")).toBe(true);
    expect(positionRowChanged(moved, "resourceMonitor")).toBe(true);
    expect(positionRowChanged(moved, "homeTab")).toBe(false);

    const reordered = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
      },
    };
    expect(positionRowChanged(reordered, "runningAgents")).toBe(true);
    expect(positionRowChanged(reordered, "attachImage")).toBe(false);
  });

  it("puts one Position row back and leaves the others alone", () => {
    const moved = {
      ...MOVED_ARRANGEMENT,
      dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
    };
    const reverted = revertPositionRow(moved, "minimap");
    expect(reverted.minimapSide).toBe(DEFAULT_ARRANGEMENT.minimapSide);
    expect(reverted.resourceSide).toBe("left");
    expect(reverted.usageHost).toBe("header");
    expect(reverted.dock).toEqual([...DEFAULT_ARRANGEMENT.dock].reverse());

    const dockBack = revertPositionRow(moved, "background");
    expect(dockBack.dock).toEqual(DEFAULT_ARRANGEMENT.dock);
    expect(dockBack.minimapSide).toBe("left");
  });
});
