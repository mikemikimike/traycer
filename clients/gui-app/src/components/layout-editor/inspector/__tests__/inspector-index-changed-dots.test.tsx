import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { regionChanged } from "@/lib/layout/layout-diff";
import { LAYOUT_REGION_IDS } from "@/lib/layout/layout-regions";
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

  it("dots a region whose Position row moved even though no value changed", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore.getState().setArrangement({
        ...arrangement,
        toolbarLeft: [...arrangement.toolbarLeft].reverse(),
      });
    });

    const snapshot = getLayoutSnapshot();
    const dots = screen.getAllByTestId("changed-dot");
    // Exactly the toolbarLeft trio (attachImage, access, agent) carries a
    // `position-order` row for that group - every other region's dot would
    // have to come from a value change, and none happened here.
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      const regionId = rowRegionId(dot);
      expect(regionChanged(snapshot, regionId)).toBe(false);
    }
  });
});
