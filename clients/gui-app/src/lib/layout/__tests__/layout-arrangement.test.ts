import { describe, expect, it } from "vitest";
import {
  asBarRegionId,
  barClusterRegions,
  barPlacement,
  barRegionsIn,
  canvasOrderGroupForRegion,
  canvasOrderGroupOf,
  DEFAULT_ARRANGEMENT,
  statusBarHostsAnyRegion,
  statusBarShown,
  toggleStatusBarSurface,
  withBarHost,
  withBarSide,
  insertRailDivider,
  moveCanvasOrderMember,
  movedWithin,
  moveRailEntry,
  moveRailPanelBeside,
  moveRailPanelToEnd,
  removeRailDivider,
  TOOLBAR_REGION_IDS,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import {
  normalizeArrangement,
  resolvePersistedArrangement,
} from "@/lib/layout/arrangement-persist";
import {
  areRailsEqual,
  DEFAULT_RAIL,
  DEFAULT_RAIL_DIVIDER_SEQ,
  normalizeRail,
  railDividerId,
  railDividerInsertIndex,
  railFromPanelIdOrder,
  panelVisibilityOverridesFromValues,
  RAIL_REGION_BY_PANEL,
  railVisibilityFor,
  visibleRailPanelIds,
  type RailEntry,
} from "@/lib/layout/rail";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";

function panel(id: RailEntry["id"]): RailEntry {
  const entry = DEFAULT_RAIL.find(
    (candidate) => candidate.kind === "panel" && candidate.id === id,
  );
  if (entry === undefined) throw new Error(`no such rail panel: ${id}`);
  return entry;
}

function divider(id: string): RailEntry {
  return { kind: "divider", id };
}

/** The rail as the ids it holds, panels and dividers alike, in order. */
function idsOf(rail: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return rail.map((entry) => entry.id);
}

/** Every panel the rail holds, hiding nothing. */
function panelIdsOf(rail: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return visibleRailPanelIds(rail, () => true);
}

function withRail(rail: ReadonlyArray<RailEntry>): LayoutArrangement {
  return { ...DEFAULT_ARRANGEMENT, rail };
}

describe("the shipped rail (L-155)", () => {
  it("is the nine panels in order, with no dividers at all", () => {
    expect(idsOf(DEFAULT_RAIL)).toEqual([
      "railAgents",
      "railArtifacts",
      "railTerminals",
      "railBrowsers",
      "railGitDiff",
      "railPullRequests",
      "railFileTree",
      "railSharing",
      "railComments",
    ]);
    expect(DEFAULT_RAIL.every((entry) => entry.kind === "panel")).toBe(true);
  });

  it("has used no divider seq, so the first one a user adds is divider:1", () => {
    expect(DEFAULT_RAIL_DIVIDER_SEQ).toBe(0);
    expect(DEFAULT_ARRANGEMENT.dividerSeq).toBe(0);

    const added = insertRailDivider(withRail(DEFAULT_RAIL), 2);

    expect(added.dividerSeq).toBe(1);
    expect(added.rail[2]).toEqual(divider("divider:1"));
  });

  it("reads back as the nine panel ids", () => {
    expect(panelIdsOf(DEFAULT_RAIL)).toEqual([
      "chats",
      "artifacts",
      "terminals",
      "browsers",
      "git-diff",
      "pull-requests",
      "file-tree",
      "sharing",
      "comments",
    ]);
  });
});

describe("the panels a rail draws", () => {
  it("drops the hidden ones and keeps the order of the rest", () => {
    const shown = new Set(["chats", "terminals", "comments"]);

    expect(
      visibleRailPanelIds(DEFAULT_RAIL, (panelId) => shown.has(panelId)),
    ).toEqual(["chats", "terminals", "comments"]);
  });

  it("never yields a divider, wherever one sits", () => {
    const rail = [divider("divider:1"), ...DEFAULT_RAIL, divider("divider:2")];

    expect(panelIdsOf(rail)).toEqual(panelIdsOf(DEFAULT_RAIL));
  });
});

describe("a panel moved within the rail", () => {
  // One mover for both drags (R5R-06): these are the arrangement's own
  // helpers, and `moveRailPanelBeside` is `moveCanvasOrderMember` with the
  // panel-id bijection applied, which is the same call the editor's canvas
  // drop makes.
  it("lands on the side of the anchor it was dropped", () => {
    expect(
      idsOf(
        moveRailPanelBeside(withRail(DEFAULT_RAIL), "comments", "chats", false)
          .rail,
      ),
    ).toEqual([
      "railComments",
      "railAgents",
      "railArtifacts",
      "railTerminals",
      "railBrowsers",
      "railGitDiff",
      "railPullRequests",
      "railFileTree",
      "railSharing",
    ]);
    expect(
      idsOf(
        moveRailPanelBeside(withRail(DEFAULT_RAIL), "chats", "terminals", true)
          .rail,
      ),
    ).toEqual([
      "railArtifacts",
      "railTerminals",
      "railAgents",
      "railBrowsers",
      "railGitDiff",
      "railPullRequests",
      "railFileTree",
      "railSharing",
      "railComments",
    ]);
  });

  it("steps over a divider rather than taking it along", () => {
    // Terminals dragged in front of Agents crosses the divider the user put
    // between Artifacts and Terminals; the divider keeps its place.
    const rail = [
      ...DEFAULT_RAIL.slice(0, 2),
      divider("divider:1"),
      ...DEFAULT_RAIL.slice(2),
    ];

    expect(
      idsOf(
        moveRailPanelBeside(withRail(rail), "terminals", "chats", false).rail,
      ).slice(0, 4),
    ).toEqual(["railTerminals", "railAgents", "railArtifacts", "divider:1"]);
  });

  it("puts a panel at the rail's end", () => {
    expect(
      idsOf(moveRailPanelToEnd(withRail(DEFAULT_RAIL), "chats").rail).at(-1),
    ).toBe("railAgents");
  });

  it("moves nothing for a panel that is not in the rail it was handed", () => {
    const arrangement = withRail(DEFAULT_RAIL.slice(0, 2));

    expect(
      moveRailPanelBeside(arrangement, "comments", "chats", false).rail,
    ).toBe(arrangement.rail);
    expect(
      moveRailPanelBeside(arrangement, "chats", "comments", false).rail,
    ).toBe(arrangement.rail);
    expect(moveRailPanelBeside(arrangement, "chats", "chats", true).rail).toBe(
      arrangement.rail,
    );
    expect(moveRailPanelToEnd(arrangement, "comments")).toBe(arrangement);
  });
});

describe("where Add divider puts one (L-159)", () => {
  it("is immediately before the last panel, never after it", () => {
    expect(railDividerInsertIndex(DEFAULT_RAIL)).toBe(DEFAULT_RAIL.length - 1);

    const added = insertRailDivider(
      withRail(DEFAULT_RAIL),
      railDividerInsertIndex(DEFAULT_RAIL),
    );

    expect(idsOf(added.rail).slice(-3)).toEqual([
      "railSharing",
      "divider:1",
      "railComments",
    ]);
  });

  it("looks past a divider already parked at the tail", () => {
    const rail = [...DEFAULT_RAIL, divider("divider:1")];

    // The last ENTRY is a divider, so the index is the last PANEL's - a second
    // divider added beside the first would space nothing either.
    expect(railDividerInsertIndex(rail)).toBe(rail.length - 2);
  });

  it("falls back to the end for a rail holding no panel at all", () => {
    const rail = [divider("divider:1")];

    expect(railDividerInsertIndex(rail)).toBe(1);
  });
});

describe("areRailsEqual", () => {
  it("compares the entries in order, kind and id", () => {
    expect(areRailsEqual(DEFAULT_RAIL, [...DEFAULT_RAIL])).toBe(true);
    expect(areRailsEqual(DEFAULT_RAIL, DEFAULT_RAIL.slice(0, 8))).toBe(false);
    expect(
      areRailsEqual(DEFAULT_RAIL, [
        ...DEFAULT_RAIL.slice(0, 2),
        divider("divider:1"),
        ...DEFAULT_RAIL.slice(2),
      ]),
    ).toBe(false);
    expect(
      areRailsEqual(
        DEFAULT_RAIL,
        moveRailPanelBeside(withRail(DEFAULT_RAIL), "comments", "chats", false)
          .rail,
      ),
    ).toBe(false);
  });
});

describe("railFromPanelIdOrder", () => {
  it("keeps the order it is handed and adds no dividers", () => {
    const rail = railFromPanelIdOrder([
      "comments",
      "chats",
      "artifacts",
      "terminals",
      "browsers",
      "git-diff",
      "pull-requests",
      "file-tree",
      "sharing",
    ]);

    expect(rail.every((entry) => entry.kind === "panel")).toBe(true);
    expect(idsOf(rail)[0]).toBe("railComments");
  });

  it("drops an id this build does not know and puts back one it never named", () => {
    const rail = railFromPanelIdOrder(["comments", "not-a-panel", "chats"]);

    expect(rail.filter((entry) => entry.kind === "divider")).toHaveLength(0);
    expect(panelIdsOf(rail)).toHaveLength(9);
    expect(idsOf(rail)[0]).toBe("railComments");
  });
});

describe("normalizeRail", () => {
  it("re-inserts a panel the stored rail never named beside its neighbours", () => {
    const stored = DEFAULT_RAIL.filter(
      (entry) => !(entry.kind === "panel" && entry.id === "railGitDiff"),
    );

    const rail = normalizeRail(stored);
    const panelIds = rail.flatMap((entry) =>
      entry.kind === "panel" ? [entry.id] : [],
    );

    expect(panelIds).toEqual(
      DEFAULT_RAIL.flatMap((entry) =>
        entry.kind === "panel" ? [entry.id] : [],
      ),
    );
    // Beside Browsers, where it belongs - not appended after Comments.
    expect(panelIdsOf(rail).indexOf("git-diff")).toBe(
      panelIdsOf(rail).indexOf("browsers") + 1,
    );
  });

  it("keeps a divider at the head and one at the tail (R5R-13)", () => {
    // What CHANGED with L-155: an edge divider used to be inert, because the
    // old group view dropped a boundary with nothing on one side of it. The
    // rail now draws every divider it holds, so normalizing must not quietly
    // eat the two the user is most likely to have parked.
    const rail = normalizeRail([
      divider("divider:20"),
      ...DEFAULT_RAIL,
      divider("divider:21"),
    ]);

    expect(idsOf(rail).at(0)).toBe("divider:20");
    expect(idsOf(rail).at(-1)).toBe("divider:21");
    expect(panelIdsOf(rail)).toEqual(panelIdsOf(DEFAULT_RAIL));
  });

  it("drops a divider whose id is not one this rail could have issued", () => {
    const rail = normalizeRail([
      { kind: "divider", id: "separator:1" },
      ...DEFAULT_RAIL.slice(0, 2),
      divider("divider:5"),
      ...DEFAULT_RAIL.slice(2),
    ]);

    // Only the `divider:` prefix survives: `highestDividerSeq` reads the
    // number off that prefix, so an id it cannot parse would leave the seq
    // free to reissue an id already on screen.
    expect(idsOf(rail)).not.toContain("separator:1");
    expect(idsOf(rail)).toContain("divider:5");
  });

  it("drops a duplicate panel and a duplicate divider", () => {
    const rail = normalizeRail([
      panel("railAgents"),
      panel("railAgents"),
      divider("divider:1"),
      divider("divider:1"),
      panel("railArtifacts"),
    ]);

    expect(
      rail.filter(
        (entry) => entry.kind === "panel" && entry.id === "railAgents",
      ),
    ).toHaveLength(1);
    expect(rail.filter((entry) => entry.kind === "divider")).toHaveLength(1);
  });
});

describe("the rail's move helpers", () => {
  it("moves a panel to a new index, dividers and all", () => {
    const withDivider = insertRailDivider(withRail(DEFAULT_RAIL), 2);
    const arrangement = moveRailEntry(withDivider, "railTerminals", 2);

    expect(idsOf(arrangement.rail).slice(0, 4)).toEqual([
      "railAgents",
      "railArtifacts",
      "railTerminals",
      "divider:1",
    ]);
  });

  it("removes a divider and leaves the panels where they were", () => {
    const withDivider = insertRailDivider(withRail(DEFAULT_RAIL), 2);
    const arrangement = removeRailDivider(withDivider, "divider:1");

    expect(idsOf(arrangement.rail)).toEqual(idsOf(DEFAULT_RAIL));
    // The seq does not go back: a removed id is never reissued.
    expect(arrangement.dividerSeq).toBe(1);
  });

  it("gives every new divider an id no divider has held", () => {
    const first = insertRailDivider(withRail(DEFAULT_RAIL), 2);
    const removed = removeRailDivider(first, "divider:1");
    const second = insertRailDivider(removed, 1);

    expect(second.dividerSeq).toBe(2);
    expect(second.rail[1]).toEqual(divider("divider:2"));
    expect(
      second.rail.some(
        (entry) => entry.kind === "divider" && entry.id === "divider:1",
      ),
    ).toBe(false);
  });

  it("leaves the rail alone when the dragged entry is not in it", () => {
    const arrangement = withRail(DEFAULT_RAIL);

    expect(moveRailEntry(arrangement, "railNowhere", 0)).toBe(arrangement);
    expect(removeRailDivider(arrangement, "divider:99")).toBe(arrangement);
  });

  it("clamps a drop past the end of the rail", () => {
    const arrangement = moveRailEntry(withRail(DEFAULT_RAIL), "railAgents", 99);

    expect(arrangement.rail.at(-1)).toEqual(panel("railAgents"));
    expect(arrangement.rail).toHaveLength(DEFAULT_RAIL.length);
  });
});

describe("movedWithin", () => {
  it("takes an item out and puts it back at the index asked for", () => {
    expect(movedWithin(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(movedWithin(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(movedWithin(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("clamps either end, and leaves a list it cannot index alone", () => {
    expect(movedWithin(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(movedWithin(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    const list = ["a", "b"];
    expect(movedWithin(list, 7, 0)).toBe(list);
  });
});

describe("a canvas drop written back into the full order (4.7)", () => {
  const arrangement: LayoutArrangement = {
    ...DEFAULT_ARRANGEMENT,
    toolbarLeft: ["attachImage", "access", "mic"],
  };

  it("puts the dragged member on the side of the anchor it was dropped", () => {
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "attachImage",
        toId: "mic",
        placeAfter: true,
      }).toolbarLeft,
    ).toEqual(["access", "mic", "attachImage"]);
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "mic",
        toId: "attachImage",
        placeAfter: false,
      }).toolbarLeft,
    ).toEqual(["mic", "attachImage", "access"]);
  });

  it("keeps a member that was NOT on screen beside the neighbours it had", () => {
    // `access` is hidden, so the canvas showed the other two; dragging the
    // first past the second must not move the hidden one relative to them.
    const next = moveCanvasOrderMember({
      arrangement,
      group: "toolbarLeft",
      fromId: "attachImage",
      toId: "mic",
      placeAfter: true,
    });

    expect(next.toolbarLeft).toEqual(["access", "mic", "attachImage"]);
  });

  it("moves nothing for an id this build does not know", () => {
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "somethingElse",
        toId: "mic",
        placeAfter: true,
      }).toolbarLeft,
    ).toBe(arrangement.toolbarLeft);
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "attachImage",
        toId: "somethingElse",
        placeAfter: true,
      }).toolbarLeft,
    ).toBe(arrangement.toolbarLeft);
  });

  it("moves a rail panel past a divider the user placed", () => {
    const withDivider = insertRailDivider(withRail(DEFAULT_RAIL), 2);
    const next = moveCanvasOrderMember({
      arrangement: withDivider,
      group: "rail",
      fromId: "railArtifacts",
      toId: railDividerId(1),
      placeAfter: true,
    });

    expect(idsOf(next.rail).slice(0, 4)).toEqual([
      "railAgents",
      "divider:1",
      "railArtifacts",
      "railTerminals",
    ]);
  });

  it("moves a rail DIVIDER, which is how a gap is re-placed", () => {
    const withDivider = insertRailDivider(withRail(DEFAULT_RAIL), 2);
    const next = moveCanvasOrderMember({
      arrangement: withDivider,
      group: "rail",
      fromId: railDividerId(1),
      toId: "railTerminals",
      placeAfter: true,
    });

    expect(idsOf(next.rail).slice(0, 4)).toEqual([
      "railAgents",
      "railArtifacts",
      "railTerminals",
      "divider:1",
    ]);
  });

  it("writes back only the group the drop was in", () => {
    const next = moveCanvasOrderMember({
      arrangement,
      group: "dock",
      fromId: "changedFiles",
      toId: "runningAgents",
      placeAfter: true,
    });

    expect(next.dock).toEqual([
      "queue",
      "todo",
      "runningAgents",
      "changedFiles",
      "background",
    ]);
    expect(next.toolbarLeft).toBe(arrangement.toolbarLeft);
    expect(next.rail).toBe(arrangement.rail);
  });
});

describe("which regions a canvas drag can pick up", () => {
  it("puts every dock and toolbar region in its own cluster", () => {
    for (const regionId of DEFAULT_ARRANGEMENT.dock)
      expect(canvasOrderGroupForRegion(regionId)).toBe("dock");
    for (const regionId of DEFAULT_ARRANGEMENT.toolbarLeft)
      expect(canvasOrderGroupForRegion(regionId)).toBe("toolbarLeft");
    for (const regionId of DEFAULT_ARRANGEMENT.toolbarRight)
      expect(canvasOrderGroupForRegion(regionId)).toBe("toolbarRight");
  });

  it("names every toolbar region exactly once across the two clusters", () => {
    expect(
      [
        ...DEFAULT_ARRANGEMENT.toolbarLeft,
        ...DEFAULT_ARRANGEMENT.toolbarRight,
      ].sort(),
    ).toEqual([...TOOLBAR_REGION_IDS].sort());
  });

  it("puts every rail panel in the rail's cluster (L-115)", () => {
    for (const entry of DEFAULT_RAIL) {
      if (entry.kind !== "panel") continue;
      expect(canvasOrderGroupForRegion(entry.id)).toBe("rail");
    }
  });

  it("refuses a region reordered in the inspector's list only", () => {
    // The usage providers are segments inside one region, so they carry no
    // identity of their own on the canvas to place by.
    expect(canvasOrderGroupForRegion("usageLimits")).toBeNull();
    expect(canvasOrderGroupForRegion("minimap")).toBeNull();
  });

  it("reads a group back off an element, and refuses anything else", () => {
    // The rail's dividers are members with no region id, so the group a press
    // belongs to is read off the attribute rather than from a region.
    expect(canvasOrderGroupOf("rail")).toBe("rail");
    expect(canvasOrderGroupOf("dock")).toBe("dock");
    expect(canvasOrderGroupOf("usageProviders")).toBeNull();
    expect(canvasOrderGroupOf("")).toBeNull();
  });
});

describe("normalizeArrangement", () => {
  it("keeps the divider counter ahead of the ids the rail is using", () => {
    const arrangement = normalizeArrangement(
      withRail([...DEFAULT_RAIL, divider("divider:42")]),
    );

    expect(arrangement.dividerSeq).toBe(42);
  });

  it("puts a toolbar region dropped into the wrong cluster back on the right", () => {
    const arrangement = normalizeArrangement({
      ...DEFAULT_ARRANGEMENT,
      toolbarLeft: ["model", "attachImage", "access"],
      toolbarRight: ["mic"],
    });

    expect(arrangement.toolbarLeft).toEqual(["attachImage", "access"]);
    // Re-inserted at its canonical position rather than appended after `mic`.
    expect(arrangement.toolbarRight).toEqual(["model", "mic"]);
  });

  it("re-inserts a dock row the arrangement lost", () => {
    const arrangement = normalizeArrangement({
      ...DEFAULT_ARRANGEMENT,
      dock: ["background"],
    });

    expect(arrangement.dock).toEqual([
      "queue",
      "todo",
      "changedFiles",
      "runningAgents",
      "background",
    ]);
  });

  it("hands an already-normal arrangement straight back, by identity", () => {
    // Every write path ends here, so a no-op write - a drag that lands where
    // it started, a bulk clear that changed nothing - must not mint a new
    // object: a fresh `arrangement` invalidates every selector subscribed to
    // any field of it, which is the whole chrome (G1-21).
    const arrangement = normalizeArrangement(DEFAULT_ARRANGEMENT);

    expect(arrangement).toBe(DEFAULT_ARRANGEMENT);
    expect(normalizeArrangement(arrangement)).toBe(arrangement);
  });

  it("re-inserts every panel when the stored rail has none left", () => {
    // An empty rail is a corrupt record, not a user preference: the sidebar
    // would have no icons at all, and no gesture in the editor can produce it.
    const arrangement = normalizeArrangement(withRail([]));

    expect(arrangement.rail).toEqual(
      DEFAULT_RAIL.filter((entry) => entry.kind === "panel"),
    );
  });
});

describe("the rail's three-state visibility (L-47, L-61)", () => {
  it("round-trips Hide, Show and back onto the panel's own rule", () => {
    expect(railVisibilityFor(true)).toBe("shown");
    expect(railVisibilityFor(false)).toBe("hidden");
    // `null` is the menu saying "follow the panel's own presence rule again",
    // which has to be the ABSENCE of an entry rather than a stored `false`.
    expect(railVisibilityFor(null)).toBe("auto");
  });

  it("reads the nine regions as the sparse map the sidebar renders from", () => {
    const values = effectiveLayoutValues("default", {
      railSharing: { shown: "shown" },
      railComments: { shown: "hidden" },
      railAgents: { shown: "auto" },
    });

    expect(panelVisibilityOverridesFromValues(values)).toEqual({
      sharing: true,
      comments: false,
    });
  });

  it("names every rail region, so a panel added later cannot be silently absent", () => {
    const values = effectiveLayoutValues(
      "default",
      Object.fromEntries(
        Object.values(RAIL_REGION_BY_PANEL).map((regionId) => [
          regionId,
          { shown: "hidden" },
        ]),
      ),
    );

    expect(
      Object.keys(panelVisibilityOverridesFromValues(values)).sort(),
    ).toEqual(Object.keys(RAIL_REGION_BY_PANEL).sort());
  });
});

describe("resolvePersistedArrangement", () => {
  it("falls back to the defaults on a record it cannot read", () => {
    expect(resolvePersistedArrangement("not an arrangement")).toEqual(
      DEFAULT_ARRANGEMENT,
    );
  });

  it("keeps a stored side and host and drops a value this build has no case for", () => {
    const arrangement = resolvePersistedArrangement({
      usageHost: "header",
      usageSide: "right",
      resourceHost: "sideways",
      minimapSide: "left",
      resourceSide: "sideways",
      mobileFooter: true,
    });

    expect(arrangement.usageHost).toBe("header");
    expect(arrangement.usageSide).toBe("right");
    expect(arrangement.minimapSide).toBe("left");
    // The feature is unreleased, so there is no migration (P5): a value this
    // build cannot read is the DEFAULT for that field alone, and the three
    // fields beside it keep what they were given.
    expect(arrangement.resourceHost).toBe(DEFAULT_ARRANGEMENT.resourceHost);
    expect(arrangement.resourceSide).toBe(DEFAULT_ARRANGEMENT.resourceSide);
    expect(arrangement.mobileFooter).toBe(true);
  });

  /**
   * L-161: a record the SHIPPED build wrote carries `usageHost` and no split
   * fields, and under that build `usageHost: "header"` meant both readings up,
   * no strip at all, and the pair drawn at the right end of the top bar. The
   * read carries that meaning rather than landing the user on today's
   * per-region defaults, which would hand them back a status bar they do not
   * have and move their gauge across the window.
   */
  it("reads a pre-split record as the arrangement it meant", () => {
    const arrangement = resolvePersistedArrangement({
      usageHost: "header",
      resourceSide: "right",
      minimapSide: "right",
      mobileFooter: false,
    });

    expect(barPlacement(arrangement, "usageLimits")).toEqual({
      host: "header",
      side: "right",
    });
    expect(barPlacement(arrangement, "resourceMonitor").host).toBe("header");
    expect(statusBarHostsAnyRegion(arrangement)).toBe(false);
  });

  it("leaves a pre-split record that kept the strip exactly where it was", () => {
    const arrangement = resolvePersistedArrangement({
      usageHost: "status-bar",
      resourceSide: "left",
    });

    expect(barPlacement(arrangement, "usageLimits")).toEqual({
      host: "status-bar",
      side: "left",
    });
    expect(barPlacement(arrangement, "resourceMonitor")).toEqual({
      host: "status-bar",
      side: "left",
    });
  });

  it("carries nothing once the record answers for itself", () => {
    // A record written by THIS build with the gauge up and the readout down:
    // the carry must not fire, or the split it stores would be undone on
    // every start.
    const arrangement = resolvePersistedArrangement({
      usageHost: "header",
      usageSide: "left",
      resourceHost: "status-bar",
      resourceSide: "right",
    });

    expect(arrangement.usageSide).toBe("left");
    expect(arrangement.resourceHost).toBe("status-bar");
  });

  it("keeps only the parked ids it has readings for", () => {
    expect(
      resolvePersistedArrangement({ statusBarParked: ["usageLimits", "nope"] })
        .statusBarParked,
    ).toEqual(["usageLimits"]);
    expect(
      resolvePersistedArrangement({ statusBarParked: "both" }).statusBarParked,
    ).toEqual([]);
  });

  /**
   * The other half of the same rule, in the direction L-142 opened: a dock
   * order written before Todo and Message queue were members has three
   * entries and this build has five. No migration exists and none is wanted
   * (P5) - `mergeOrder` against `DEFAULT_DOCK_ORDER` is the whole of it.
   *
   * The two lead, because that is where `ChatLowerDock` already draws them
   * and a stored order says nothing about members it never had: the person
   * whose record this is has been looking at Queue above Todo above the rest,
   * and nothing about opening a newer build should move them.
   */
  it("materialises the dock members a stored order predates", () => {
    const arrangement = resolvePersistedArrangement({
      dock: ["changedFiles", "runningAgents", "background"],
    });

    expect(arrangement.dock).toEqual([
      "queue",
      "todo",
      "changedFiles",
      "runningAgents",
      "background",
    ]);
  });

  /**
   * And it is NEIGHBOUR placement rather than an append, which is the rule
   * `mergeOrder` states for every order field this app stores: a member the
   * stored list never had lands after the canonical id ahead of it that is
   * actually present. Neither of these two HAS one - they open the canonical
   * list - so both land at the front whatever the user did with the other
   * three, and `queue` anchors `todo` in turn so the pair keeps its own order.
   * A rearranged dock is what tells that apart from a plain append: the three
   * rows below keep the order they were given.
   */
  it("lands them at the front of a rearranged dock, rows undisturbed", () => {
    const arrangement = resolvePersistedArrangement({
      dock: ["background", "changedFiles", "runningAgents"],
    });

    expect(arrangement.dock).toEqual([
      "queue",
      "todo",
      "background",
      "changedFiles",
      "runningAgents",
    ]);
  });

  /**
   * The unreleased-feature rule in the one place a retired region can still
   * arrive: a blob written while `agent` existed (L-136). Tolerant parsing,
   * not migration - the id is simply not one `TOOLBAR_REGION_IDS` names, so it
   * never reaches an arrangement, and the members around it keep the order the
   * user gave them.
   */
  it("drops a toolbar region this build retired and keeps the rest in stored order", () => {
    const arrangement = resolvePersistedArrangement({
      toolbarLeft: ["access", "agent", "attachImage"],
      toolbarRight: ["model", "mic"],
    });

    expect(arrangement.toolbarLeft).toEqual(["access", "attachImage"]);
    expect(arrangement.toolbarRight).toEqual(["model", "mic"]);
  });

  it("materialises every provider and keeps the order the stored pair had", () => {
    const arrangement = resolvePersistedArrangement({
      usageProviders: ["grok", "codex", "not-a-provider"],
      hiddenProviders: ["codex", "not-a-provider"],
    });

    expect(arrangement.usageProviders.indexOf("grok")).toBeLessThan(
      arrangement.usageProviders.indexOf("codex"),
    );
    expect(arrangement.usageProviders).toHaveLength(
      DEFAULT_ARRANGEMENT.usageProviders.length,
    );
    expect(arrangement.hiddenProviders).toEqual(["codex"]);
  });

  it("keeps a drawable limit selection and reads an empty pick list as Automatic", () => {
    // The `automatic` booleans are what a record written before R1-15 carries.
    // They are ignored rather than rejected: the only thing that field ever
    // said was whether the list was empty, and the list says it.
    const arrangement = resolvePersistedArrangement({
      providerLimits: {
        codex: { automatic: false, limitKeys: ["weekly"] },
        grok: { automatic: false, limitKeys: [] },
        nobody: { automatic: true, limitKeys: [] },
      },
    });

    expect(arrangement.providerLimits).toEqual({
      codex: { limitKeys: ["weekly"] },
      grok: { limitKeys: [] },
    });
  });

  it("drops a host whose every provider resolved to nothing checked", () => {
    const arrangement = resolvePersistedArrangement({
      shownProfiles: {
        "host-1": { codex: ["profile-1", null], nobody: ["profile-2"] },
        "host-2": { codex: [] },
      },
    });

    expect(arrangement.shownProfiles).toEqual({
      "host-1": { codex: ["profile-1", null] },
    });
  });

  it("reads a stored rail and re-inserts what this build added to it", () => {
    const arrangement = resolvePersistedArrangement({
      rail: [
        { kind: "panel", id: "railAgents" },
        { kind: "panel", id: "railRetired" },
        { kind: "divider", id: "divider:4" },
        { kind: "panel", id: "railComments" },
      ],
      dividerSeq: 1,
    });

    // Every panel is back, each beside its canonical neighbour, so a panel
    // this build added lands next to the one it belongs after rather than
    // piling up at the end. The stored divider survives with its id.
    expect(
      arrangement.rail.filter((entry) => entry.kind === "panel"),
    ).toHaveLength(9);
    expect(idsOf(arrangement.rail)).toEqual([
      "railAgents",
      "railArtifacts",
      "railTerminals",
      "railBrowsers",
      "railGitDiff",
      "railPullRequests",
      "railFileTree",
      "railSharing",
      "divider:4",
      "railComments",
    ]);
    expect(arrangement.dividerSeq).toBe(4);
  });
});

/**
 * L-156: usage limits and the resource monitor each pick a bar and an end of
 * it, and moving one never moves the other. The shipped answer is the frame
 * the app has always drawn - usage on the left of the strip, the readout on
 * its right - so a user who never opens the editor sees no change at all.
 */
describe("the two bar readings (L-156)", () => {
  it("ships with each reading where the app has always drawn it", () => {
    expect(barPlacement(DEFAULT_ARRANGEMENT, "usageLimits")).toEqual({
      host: "status-bar",
      side: "left",
    });
    expect(barPlacement(DEFAULT_ARRANGEMENT, "resourceMonitor")).toEqual({
      host: "status-bar",
      side: "right",
    });
  });

  it("moves one reading without touching the other, on either axis", () => {
    const usageUp = withBarHost(DEFAULT_ARRANGEMENT, "usageLimits", "header");

    expect(barPlacement(usageUp, "usageLimits").host).toBe("header");
    expect(barPlacement(usageUp, "resourceMonitor")).toEqual(
      barPlacement(DEFAULT_ARRANGEMENT, "resourceMonitor"),
    );

    const monitorLeft = withBarSide(usageUp, "resourceMonitor", "left");

    expect(barPlacement(monitorLeft, "resourceMonitor")).toEqual({
      host: "status-bar",
      side: "left",
    });
    expect(barPlacement(monitorLeft, "usageLimits")).toEqual(
      barPlacement(usageUp, "usageLimits"),
    );
  });

  it("answers each of the four clusters with what it holds", () => {
    expect(
      barClusterRegions(DEFAULT_ARRANGEMENT, "status-bar", "left"),
    ).toEqual(["usageLimits"]);
    expect(
      barClusterRegions(DEFAULT_ARRANGEMENT, "status-bar", "right"),
    ).toEqual(["resourceMonitor"]);
    expect(barClusterRegions(DEFAULT_ARRANGEMENT, "header", "left")).toEqual(
      [],
    );
    expect(barClusterRegions(DEFAULT_ARRANGEMENT, "header", "right")).toEqual(
      [],
    );
  });

  it("puts usage limits first wherever the two share a bar and a side", () => {
    // Reached from the monitor's side rather than by writing both, so the
    // order is the MODEL's and not the order the fields were written in.
    const shareLeft = withBarSide(
      DEFAULT_ARRANGEMENT,
      "resourceMonitor",
      "left",
    );
    expect(barClusterRegions(shareLeft, "status-bar", "left")).toEqual([
      "usageLimits",
      "resourceMonitor",
    ]);

    const shareHeaderRight = withBarHost(
      withBarHost(
        withBarSide(DEFAULT_ARRANGEMENT, "usageLimits", "right"),
        "usageLimits",
        "header",
      ),
      "resourceMonitor",
      "header",
    );
    expect(barClusterRegions(shareHeaderRight, "header", "right")).toEqual([
      "usageLimits",
      "resourceMonitor",
    ]);
  });

  it("keeps the strip on screen for as long as either reading is in it", () => {
    const usageUp = withBarHost(DEFAULT_ARRANGEMENT, "usageLimits", "header");
    const bothUp = withBarHost(usageUp, "resourceMonitor", "header");

    expect(statusBarHostsAnyRegion(DEFAULT_ARRANGEMENT)).toBe(true);
    expect(statusBarHostsAnyRegion(usageUp)).toBe(true);
    expect(statusBarHostsAnyRegion(bothUp)).toBe(false);

    expect(statusBarShown(usageUp, false)).toBe(true);
    expect(statusBarShown(bothUp, false)).toBe(false);
    // A mobile viewport answers with its own switch and ignores both hosts
    // (L-51), which L-156 does not touch.
    expect(statusBarShown(DEFAULT_ARRANGEMENT, true)).toBe(false);
    expect(statusBarShown({ ...bothUp, mobileFooter: true }, true)).toBe(true);
  });

  it("names the two readings and nothing else", () => {
    expect(asBarRegionId("usageLimits")).toBe("usageLimits");
    expect(asBarRegionId("resourceMonitor")).toBe("resourceMonitor");
    expect(asBarRegionId("minimap")).toBe(null);
    expect(asBarRegionId("not-a-region")).toBe(null);
  });
});

/**
 * L-160: "Toggle status bar" is its own inverse. It sends whatever the strip
 * holds to the header and remembers that set; the next press brings exactly
 * that set back. The arrangement L-156 exists to let a person build - one
 * reading up, one down - survives the round trip instead of being flattened.
 */
describe("the status bar surface toggle (L-160)", () => {
  it("empties the strip, then fills it back the same way", () => {
    const parked = toggleStatusBarSurface(DEFAULT_ARRANGEMENT);

    expect(statusBarHostsAnyRegion(parked)).toBe(false);
    expect(parked.statusBarParked).toEqual(["usageLimits", "resourceMonitor"]);

    const back = toggleStatusBarSurface(parked);

    expect(barPlacement(back, "usageLimits")).toEqual(
      barPlacement(DEFAULT_ARRANGEMENT, "usageLimits"),
    );
    expect(barPlacement(back, "resourceMonitor")).toEqual(
      barPlacement(DEFAULT_ARRANGEMENT, "resourceMonitor"),
    );
    expect(back.statusBarParked).toEqual([]);
  });

  it("leaves a mixed arrangement exactly as it found it after two presses", () => {
    // The gauge up on the right, the readout still in the strip: the whole
    // point of L-156, and what a lossy toggle flattened on the second press.
    const mixed = withBarSide(
      withBarHost(DEFAULT_ARRANGEMENT, "usageLimits", "header"),
      "usageLimits",
      "right",
    );

    const parked = toggleStatusBarSurface(mixed);
    expect(statusBarHostsAnyRegion(parked)).toBe(false);
    expect(parked.statusBarParked).toEqual(["resourceMonitor"]);

    const back = toggleStatusBarSurface(parked);
    expect(barPlacement(back, "usageLimits")).toEqual(
      barPlacement(mixed, "usageLimits"),
    );
    expect(barPlacement(back, "resourceMonitor")).toEqual(
      barPlacement(mixed, "resourceMonitor"),
    );
    expect(back.statusBarParked).toEqual([]);
  });

  it("makes three presses the same as one", () => {
    const mixed = withBarHost(DEFAULT_ARRANGEMENT, "usageLimits", "header");
    const once = toggleStatusBarSurface(mixed);
    const thrice = toggleStatusBarSurface(
      toggleStatusBarSurface(toggleStatusBarSurface(mixed)),
    );

    expect(thrice).toEqual(once);
  });

  it("brings both down when an emptied strip remembers nothing", () => {
    // The strip emptied some other way - the region rows, the strip's own
    // menu - so there is no remembered set to restore and "show the status
    // bar" can only mean both.
    const empty = withBarHost(
      withBarHost(DEFAULT_ARRANGEMENT, "usageLimits", "header"),
      "resourceMonitor",
      "header",
    );

    const back = toggleStatusBarSurface(empty);

    expect(barRegionsIn(back, "status-bar")).toEqual([
      "usageLimits",
      "resourceMonitor",
    ]);
  });

  it("never moves a reading to the other end of its bar", () => {
    const sided = withBarSide(
      withBarSide(DEFAULT_ARRANGEMENT, "usageLimits", "right"),
      "resourceMonitor",
      "left",
    );
    const round = toggleStatusBarSurface(toggleStatusBarSurface(sided));

    expect([round.usageSide, round.resourceSide]).toEqual(["right", "left"]);
  });
});
