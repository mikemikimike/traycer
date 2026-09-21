import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { regionChanged, reorderedGroups } from "@/lib/layout/layout-diff";
import { LAYOUT_REGION_IDS } from "@/components/layout-editor/regions/region-facts";
import {
  DEFAULT_ARRANGEMENT,
  insertRailDivider,
  moveRailEntry,
} from "@/lib/layout/layout-arrangement";
import type { RailEntry } from "@/lib/layout/rail";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

function isRegionId(id: string): id is RegionId {
  return LAYOUT_REGION_IDS.some((candidate) => candidate === id);
}

/** The rail's panels in order, which is what "moved" is measured on (I-17). */
function railEntryIds(rail: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return rail.flatMap((entry) => (entry.kind === "divider" ? [] : [entry.id]));
}

/** The name span of one index row, which is what carries the muting (I-09). */
function regionNameSpan(regionId: RegionId): HTMLElement {
  const name = document.querySelector<HTMLElement>(
    `[data-region-id="${regionId}"] span`,
  );
  if (name === null) throw new Error(`no index row for ${regionId}`);
  return name;
}

function rowRegionId(dot: HTMLElement): RegionId {
  const id = dot.closest("button")?.getAttribute("data-region-id");
  if (id === null || id === undefined || !isRegionId(id)) {
    throw new Error("changed-dot rendered outside an index row");
  }
  return id;
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({
    instances: new Map(),
    dockMode: "right",
    lockedBy: "none",
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("index row state (I-09)", () => {
  it("mutes a hidden region's name and leaves a shown one at full strength", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    expect(regionNameSpan("resourceMonitor").className).not.toContain(
      "text-muted-foreground",
    );

    act(() => {
      useLayoutStore
        .getState()
        .setRegionValues("resourceMonitor", { shown: "hidden" });
    });

    expect(regionNameSpan("resourceMonitor").className).toContain(
      "text-muted-foreground",
    );
  });

  it("leaves a rail panel on Auto at full strength", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    // "Auto" is a rule, not an off state: muting it would say the panel is
    // gone when it is exactly where the app puts it.
    expect(regionNameSpan("railAgents").className).not.toContain(
      "text-muted-foreground",
    );

    act(() => {
      useLayoutStore.getState().setRegionValues("railAgents", {
        shown: "hidden",
      });
    });
    expect(regionNameSpan("railAgents").className).toContain(
      "text-muted-foreground",
    );
  });
});

describe("index changed-dots and the header count (L-57)", () => {
  it("shows neither a dot nor a change count before anything is touched", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    expect(screen.queryAllByTestId("changed-dot")).toHaveLength(0);
    // Scoped to the status line: "Default" alone also names the preset
    // card underneath it, so an unscoped query is ambiguous.
    expect(screen.getByTestId("preset-status-line").textContent).toBe(
      "Default",
    );
  });

  it("dots the region a value change touches, and the header counts it", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    act(() => {
      useLayoutStore.getState().setRegionValues("resourceMonitor", {
        shown: "hidden",
      });
    });

    const dots = screen.getAllByTestId("changed-dot");
    expect(dots).toHaveLength(1);
    expect(rowRegionId(dots[0])).toBe("resourceMonitor");
    expect(regionChanged(getLayoutSnapshot(), "resourceMonitor")).toBe(true);
    // A pure value change reorders nothing and hides no provider, so the
    // header count and the value-change count agree - the case L-57 asks for.
    expect(screen.getByTestId("preset-status-line").textContent).toBe(
      "Default + 1 change",
    );
  });

  it("dots no sidebar row when only a rail divider moved (I-17)", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      // In the middle, where it really splits a group: a trailing divider is
      // not part of the rail's grouping at all, so it would not reorder the
      // group either and the case would prove nothing.
      useLayoutStore
        .getState()
        .setArrangement(insertRailDivider(arrangement, 1));
    });

    // The rail IS reordered as a group - a divider is one of its entries -
    // and that is what the Position row's own revert offers. No panel moved
    // relative to another, though, so no ROW changed, which is the whole of
    // the narrowing: the shipped grouping arrives as dividers (L-49), and
    // group-level reading lit all nine sidebar rows on entry.
    expect(
      reorderedGroups(getLayoutSnapshot().arrangement).includes("rail"),
    ).toBe(true);
    expect(screen.queryAllByTestId("changed-dot")).toHaveLength(0);
  });

  it("dots the rail rows that a reorder actually moved", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    const railBefore = useLayoutStore.getState().arrangement.rail;
    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore
        .getState()
        .setArrangement(moveRailEntry(arrangement, "railFileTree", 0));
    });

    const before = railEntryIds(railBefore);
    const moved = new Set(
      railEntryIds(useLayoutStore.getState().arrangement.rail).filter(
        (id, index) => before.indexOf(id) !== index,
      ),
    );
    expect(moved.has("railFileTree")).toBe(true);
    const dotted = new Set(
      screen.getAllByTestId("changed-dot").map((dot) => rowRegionId(dot)),
    );
    expect(dotted).toEqual(moved);
  });

  it("dots a region whose Position row moved even though no value changed", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore.getState().setArrangement({
        ...arrangement,
        dock: [...arrangement.dock].reverse(),
      });
    });

    const snapshot = getLayoutSnapshot();
    const dots = screen.getAllByTestId("changed-dot");
    // Reversing an odd-length list leaves the MIDDLE member at its own index:
    // it has not moved, so it carries no dot, which is exactly the narrowing
    // (I-17) - the group is reordered, that row is not. The dock has five
    // members since L-142, so the middle one is `background`.
    const dock = DEFAULT_ARRANGEMENT.dock;
    const middle = dock[(dock.length - 1) / 2];
    const dotted = dots.map((dot) => rowRegionId(dot));
    expect(dotted.length).toBe(dock.length - 1);
    expect(dotted).not.toContain(middle);
    for (const regionId of dotted) {
      expect(regionChanged(snapshot, regionId)).toBe(false);
    }
  });
});
