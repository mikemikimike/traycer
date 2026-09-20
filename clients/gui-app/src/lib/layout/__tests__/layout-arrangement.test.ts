import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARRANGEMENT,
  DEFAULT_RAIL,
  insertRailDivider,
  leftPanelGroupsFromRail,
  moveRailEntry,
  normalizeArrangement,
  normalizeRail,
  railFromLeftPanelGroups,
  removeRailDivider,
  resolvePersistedArrangement,
  type LayoutArrangement,
  type RailEntry,
} from "@/lib/layout/layout-arrangement";
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
