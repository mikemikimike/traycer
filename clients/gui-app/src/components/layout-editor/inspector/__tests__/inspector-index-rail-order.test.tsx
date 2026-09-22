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
 * region row by its region id, a divider by its own id.
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

describe("the sidebar index follows the rail (LV2-09, LV4-05)", () => {
  it("lists the panels in the rail's order", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    // The shipped rail is not the registry's order - Artifacts is declared
    // fourth and drawn second - so this case fails on the old list without
    // anything having to be moved first.
    expect(railPanelIds(DEFAULT_RAIL)).not.toEqual(registrySidebarIds());
    expect(sidebarLineIds()).toEqual(railLineIds(DEFAULT_RAIL));
  });

  it("shows no divider by default, because the rail has none (L-155)", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    expect(sidebarLineIds().filter((id) => id.startsWith("divider:"))).toEqual(
      [],
    );
  });

  it("shows EVERY divider the rail holds, wherever it sits", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    // One at the head, two in a row, one at the tail: the index is the rail's
    // membership, so all four are lines here and all four are rows in the
    // Position list beside it (LV4-05).
    setRail([
      { kind: "divider", id: railDividerId(20) },
      { kind: "panel", id: "railAgents" },
      { kind: "divider", id: railDividerId(21) },
      { kind: "divider", id: railDividerId(22) },
      { kind: "panel", id: "railArtifacts" },
      { kind: "divider", id: railDividerId(23) },
    ]);

    const rail = useLayoutStore.getState().arrangement.rail;
    expect(sidebarLineIds()).toEqual(railLineIds(rail));
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
    expect(sidebarLineIds().at(0)).toBe("railComments");
    expect(sidebarLineIds()).toEqual(railLineIds(rail));
  });

  it("drops every divider while a filter is on", () => {
    // A filtered index is a search result, not the rail's picture: a rule
    // between two rows that are no longer adjacent would say something
    // untrue, so the one exception to the membership rule is stated here.
    setRail([
      { kind: "panel", id: "railAgents" },
      { kind: "divider", id: railDividerId(30) },
      { kind: "panel", id: "railTerminals" },
    ]);
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    act(() => {
      useLayoutEditorStore.getState().setFilter("terminals");
    });

    expect(sidebarLineIds()).toEqual(["railTerminals"]);
  });

  it("steps an arrow over a divider", () => {
    setRail([
      ...DEFAULT_RAIL.slice(0, 2),
      { kind: "divider", id: railDividerId(40) },
      ...DEFAULT_RAIL.slice(2),
    ]);
    render(<InspectorIndex onPreviewPreset={() => {}} />);

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
