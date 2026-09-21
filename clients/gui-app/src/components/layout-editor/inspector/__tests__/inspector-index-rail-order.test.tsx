import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { LAYOUT_REGION_LIST } from "@/components/layout-editor/regions/region-facts";
import { moveRailEntry } from "@/lib/layout/layout-arrangement";
import { DEFAULT_RAIL, railDividerId, type RailEntry } from "@/lib/layout/rail";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The sidebar group's lines in document order, each named by what it is: a
 * region row by its region id, a break by the divider's own id.
 *
 * Read off the DOM rather than off a test-only hook, because the order on
 * screen is the whole subject (LV2-09) - the index used to draw the nine
 * panels in registry order beside a canvas drawing them in the rail's.
 */
function sidebarLineIds(): ReadonlyArray<string> {
  const lines = document.querySelectorAll<HTMLElement>(
    '[data-region-id^="rail"], [data-rail-divider]',
  );
  return [...lines].map((line) => {
    const divider = line.getAttribute("data-rail-divider");
    if (divider !== null) return divider;
    const regionId = line.getAttribute("data-region-id");
    if (regionId === null) throw new Error("a sidebar line named nothing");
    return regionId;
  });
}

function railLineIds(rail: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return rail.map((entry) => entry.id);
}

function railPanelIds(rail: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return rail.flatMap((entry) => (entry.kind === "divider" ? [] : [entry.id]));
}

/** What the index listed before it read the rail: the registry's own order. */
function registrySidebarIds(): ReadonlyArray<string> {
  return LAYOUT_REGION_LIST.filter(
    (region) => region.surface === "sidebar",
  ).map((region) => region.id);
}

function setRail(rail: ReadonlyArray<RailEntry>): void {
  act(() => {
    const arrangement = useLayoutStore.getState().arrangement;
    useLayoutStore.getState().setArrangement({ ...arrangement, rail });
  });
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

describe("the sidebar index follows the rail (LV2-09)", () => {
  it("lists the panels in the rail's order and its breaks between them", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    // The shipped rail is not the registry's order - Artifacts is declared
    // fourth and drawn second - so this case fails on the old list without
    // anything having to be moved first.
    expect(railPanelIds(DEFAULT_RAIL)).not.toEqual(registrySidebarIds());
    expect(sidebarLineIds()).toEqual(railLineIds(DEFAULT_RAIL));
  });

  it("follows a reorder", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore
        .getState()
        .setArrangement(moveRailEntry(arrangement, "railComments", 0));
    });

    const rail = useLayoutStore.getState().arrangement.rail;
    const lines = sidebarLineIds();
    expect(lines.at(0)).toBe("railComments");
    expect(lines.filter((id) => !id.startsWith("divider:"))).toEqual(
      railPanelIds(rail),
    );
    // Comments was the rail's last panel, so the break above it is now the
    // rail's last entry and separates nothing - the same rule that hides a
    // divider parked at either end.
    expect(rail.at(-1)?.id).toBe(railDividerId(7));
    expect(lines).not.toContain(railDividerId(7));
  });

  it("draws no break with nothing on one side of it", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    const second = railDividerId(21);
    setRail([
      { kind: "divider", id: railDividerId(20) },
      { kind: "panel", id: "railAgents" },
      { kind: "divider", id: railDividerId(22) },
      { kind: "divider", id: second },
      { kind: "panel", id: "railArtifacts" },
      { kind: "divider", id: railDividerId(23) },
    ]);

    // The store re-inserts the panels this rail did not name, so the assertions
    // below name what the case is about rather than the whole sequence: a
    // divider at either end separates nothing - the rail itself draws no group
    // for it - and two in a row are one boundary, not two.
    const lines = sidebarLineIds();
    expect(lines.at(0)).toBe("railAgents");
    expect(lines.at(-1)).toBe("railComments");
    expect(lines.filter((id) => id.startsWith("divider:"))).toEqual([second]);
    expect(lines.indexOf(second)).toBe(1);
  });

  it("drops a break the filter has left with one neighbour", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    act(() => {
      useLayoutEditorStore.getState().setFilter("terminals");
    });

    expect(sidebarLineIds()).toEqual(["railTerminals"]);
  });

  it("steps an arrow over a break", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    // Artifacts and Terminals are two groups apart in the shipped rail, so
    // the walk crosses a drawn boundary here.
    const row = document.querySelector<HTMLElement>(
      '[data-region-id="railArtifacts"]',
    );
    if (row === null) throw new Error("no Artifacts row");
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowDown" });

    expect(document.activeElement?.getAttribute("data-region-id")).toBe(
      "railTerminals",
    );
  });
});
