import { describe, expect, it } from "vitest";
import {
  canvasOrderGroupForRegion,
  DEFAULT_ARRANGEMENT,
  insertRailDivider,
  moveCanvasOrderMember,
  movedWithin,
  moveRailEntry,
  removeRailDivider,
  TOOLBAR_REGION_IDS,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import {
  normalizeArrangement,
  resolvePersistedArrangement,
} from "@/lib/layout/arrangement-persist";
import {
  DEFAULT_RAIL,
  leftPanelGroupsFromRail,
  normalizeRail,
  panelVisibilityOverridesFromValues,
  RAIL_REGION_BY_PANEL,
  railFromLeftPanelGroups,
  railVisibilityFor,
  type RailEntry,
} from "@/lib/layout/rail";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import { DEFAULT_LEFT_PANEL_GROUPS } from "@/stores/epics/left-panel-store";

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

function groupsOf(rail: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return leftPanelGroupsFromRail(rail).map((group) => group.panelIds.join(","));
}

function withRail(rail: ReadonlyArray<RailEntry>): LayoutArrangement {
  return { ...DEFAULT_ARRANGEMENT, rail };
}

describe("the rail and the sidebar's groups", () => {
  it("reads the shipped rail as the shipped grouping", () => {
    expect(leftPanelGroupsFromRail(DEFAULT_RAIL)).toEqual(
      DEFAULT_LEFT_PANEL_GROUPS,
    );
  });

  it("writes the shipped grouping back as the shipped rail", () => {
    expect(railFromLeftPanelGroups(DEFAULT_LEFT_PANEL_GROUPS, 0)).toEqual(
      DEFAULT_RAIL,
    );
  });

  it("gives an empty group no divider and drops it", () => {
    const rail = railFromLeftPanelGroups(
      [
        DEFAULT_LEFT_PANEL_GROUPS[0],
        { panelIds: [] },
        ...DEFAULT_LEFT_PANEL_GROUPS.slice(1),
      ],
      0,
    );

    // The empty group contributes neither a divider nor a boundary, so the
    // rail is the shipped one - not one with a stray divider in it.
    expect(rail).toEqual(DEFAULT_RAIL);
  });

  it("drops a divider at either end on the way out and never re-creates it", () => {
    const rail = normalizeRail([
      divider("divider:9"),
      ...DEFAULT_RAIL,
      divider("divider:10"),
    ]);

    // Inert rather than an empty column: the groups are exactly the shipped
    // ones, and reading the groups back never re-issues the edge dividers.
    expect(leftPanelGroupsFromRail(rail)).toEqual(DEFAULT_LEFT_PANEL_GROUPS);
    expect(railFromLeftPanelGroups(leftPanelGroupsFromRail(rail), 0)).toEqual(
      DEFAULT_RAIL,
    );
  });

  it("gives two dividers in a row no group between them", () => {
    const rail = normalizeRail([
      ...DEFAULT_RAIL.slice(0, 3),
      divider("divider:99"),
      ...DEFAULT_RAIL.slice(3),
    ]);

    expect(leftPanelGroupsFromRail(rail)).toEqual(DEFAULT_LEFT_PANEL_GROUPS);
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
    expect(groupsOf(rail)).toContain("browsers,git-diff");
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
  it("moves a panel into the group ahead of it", () => {
    // Terminals sits alone behind the first divider; dragging it in front of
    // that divider puts it in the Agents group.
    const arrangement = moveRailEntry(
      withRail(DEFAULT_RAIL),
      "railTerminals",
      2,
    );

    expect(groupsOf(arrangement.rail)[0]).toBe("chats,artifacts,terminals");
  });

  it("merges two groups when their divider is removed", () => {
    const arrangement = removeRailDivider(withRail(DEFAULT_RAIL), "divider:1");

    expect(groupsOf(arrangement.rail)[0]).toBe("chats,artifacts,terminals");
    expect(arrangement.dividerSeq).toBe(DEFAULT_ARRANGEMENT.dividerSeq);
  });

  it("splits a group on a new divider id that no divider has held", () => {
    const merged = removeRailDivider(withRail(DEFAULT_RAIL), "divider:1");
    const split = insertRailDivider(merged, 1);

    expect(groupsOf(split.rail).slice(0, 2)).toEqual([
      "chats",
      "artifacts,terminals",
    ]);
    expect(split.dividerSeq).toBe(DEFAULT_ARRANGEMENT.dividerSeq + 1);
    expect(
      split.rail.some(
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
    toolbarLeft: ["attachImage", "access", "agent"],
  };

  it("puts the dragged member on the side of the anchor it was dropped", () => {
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "attachImage",
        toId: "agent",
        placeAfter: true,
      }).toolbarLeft,
    ).toEqual(["access", "agent", "attachImage"]);
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "agent",
        toId: "attachImage",
        placeAfter: false,
      }).toolbarLeft,
    ).toEqual(["agent", "attachImage", "access"]);
  });

  it("keeps a member that was NOT on screen beside the neighbours it had", () => {
    // `access` is hidden, so the canvas showed the other two; dragging the
    // first past the second must not move the hidden one relative to them.
    const next = moveCanvasOrderMember({
      arrangement,
      group: "toolbarLeft",
      fromId: "attachImage",
      toId: "agent",
      placeAfter: true,
    });

    expect(next.toolbarLeft).toEqual(["access", "agent", "attachImage"]);
  });

  it("moves nothing for an id this build does not know", () => {
    expect(
      moveCanvasOrderMember({
        arrangement,
        group: "toolbarLeft",
        fromId: "somethingElse",
        toId: "agent",
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

  it("writes back only the group the drop was in", () => {
    const next = moveCanvasOrderMember({
      arrangement,
      group: "dock",
      fromId: "changedFiles",
      toId: "runningAgents",
      placeAfter: true,
    });

    expect(next.dock).toEqual(["runningAgents", "changedFiles", "background"]);
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

  it("refuses a region reordered in the inspector's list only", () => {
    // The rail draws one button per GROUP and no divider at all, and the
    // usage providers are segments inside one region.
    expect(canvasOrderGroupForRegion("railAgents")).toBeNull();
    expect(canvasOrderGroupForRegion("usageLimits")).toBeNull();
    expect(canvasOrderGroupForRegion("minimap")).toBeNull();
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
      toolbarLeft: ["model", "attachImage", "access", "agent"],
      toolbarRight: ["mic"],
    });

    expect(arrangement.toolbarLeft).toEqual(["attachImage", "access", "agent"]);
    // Re-inserted at its canonical position rather than appended after `mic`.
    expect(arrangement.toolbarRight).toEqual(["model", "mic"]);
  });

  it("re-inserts a dock row the arrangement lost", () => {
    const arrangement = normalizeArrangement({
      ...DEFAULT_ARRANGEMENT,
      dock: ["background"],
    });

    expect(arrangement.dock).toEqual([
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
      minimapSide: "left",
      resourceSide: "sideways",
      mobileFooter: true,
    });

    expect(arrangement.usageHost).toBe("header");
    expect(arrangement.minimapSide).toBe("left");
    expect(arrangement.resourceSide).toBe(DEFAULT_ARRANGEMENT.resourceSide);
    expect(arrangement.mobileFooter).toBe(true);
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

  it("keeps a drawable limit selection and repairs one that draws nothing", () => {
    const arrangement = resolvePersistedArrangement({
      providerLimits: {
        codex: { automatic: false, limitKeys: ["weekly"] },
        grok: { automatic: false, limitKeys: [] },
        nobody: { automatic: true, limitKeys: [] },
      },
    });

    expect(arrangement.providerLimits).toEqual({
      codex: { automatic: false, limitKeys: ["weekly"] },
      grok: { automatic: true, limitKeys: [] },
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

    // Every panel is back, each beside its canonical neighbour, so the panels
    // this build added join the group their neighbour is in rather than
    // piling up at the end. The stored divider survives with its id.
    expect(
      arrangement.rail.filter((entry) => entry.kind === "panel"),
    ).toHaveLength(9);
    expect(groupsOf(arrangement.rail)).toEqual([
      "chats,artifacts,terminals,browsers,git-diff,pull-requests,file-tree,sharing",
      "comments",
    ]);
    expect(arrangement.dividerSeq).toBe(4);
  });
});
