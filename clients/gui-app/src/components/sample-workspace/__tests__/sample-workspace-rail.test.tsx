import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLeftPanelDefinition } from "@/components/epic-canvas/sidebar/left-panel-registry";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/region-drag";
import { SampleWorkspaceRail } from "@/components/sample-workspace/sample-workspace-rail";
import { leftPanelIdForRailRegion } from "@/lib/layout/rail";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

/**
 * The surface a session's rail drag happens on (L-115).
 *
 * The editor's canvas is always the sample workspace, so this rail is where
 * the nine icons and the seven boundaries are picked up - and what it has to
 * be is `arrangement.rail` itself, entry for entry, inside one cluster.
 */

function railEntries(): ReadonlyArray<HTMLElement> {
  const aside = screen.getByLabelText("Sample sidebar");
  return [...aside.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("the sample workspace's icon rail", () => {
  it("draws one element per rail entry, boundaries included", () => {
    render(<SampleWorkspaceRail />);

    const rail = useLayoutStore.getState().arrangement.rail;
    expect(
      railEntries().map((node) =>
        node.getAttribute("data-testid") === "epic-rail-divider"
          ? "divider"
          : node.getAttribute("aria-label"),
      ),
    ).toEqual(
      rail.map((entry) =>
        entry.kind === "divider"
          ? "divider"
          : getLeftPanelDefinition(leftPanelIdForRailRegion(entry.id)).title,
      ),
    );
  });

  it("lays the entries out in one cluster, which is the drop's own scope", () => {
    render(<SampleWorkspaceRail />);

    const aside = screen.getByLabelText("Sample sidebar");
    expect(aside.hasAttribute(LAYOUT_CLUSTER_ATTRIBUTE)).toBe(true);
    for (const node of railEntries())
      expect(node.closest(`[${LAYOUT_CLUSTER_ATTRIBUTE}]`)).toBe(aside);
  });

  it("marks no member at rest", () => {
    render(<SampleWorkspaceRail />);

    for (const node of railEntries()) {
      expect(node.getAttribute("data-layout-group")).toBeNull();
      expect(node.getAttribute("data-layout-draggable")).toBeNull();
      expect(node.getAttribute("data-layout-member")).toBeNull();
    }
  });

  it("makes every entry a draggable member of the rail in a session", () => {
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      startedAt: 0,
    });

    render(<SampleWorkspaceRail />);

    const rail = useLayoutStore.getState().arrangement.rail;
    const nodes = railEntries();
    expect(nodes).toHaveLength(rail.length);
    for (const [index, entry] of rail.entries()) {
      const node = nodes[index];
      expect(node.getAttribute("data-layout-group")).toBe("rail");
      expect(node.getAttribute("data-layout-draggable")).toBe("1");
      // A panel is a region and a boundary is not, so they name themselves
      // through different attributes - and the drop reads both.
      expect(
        node.getAttribute("data-layout-member") ??
          node.getAttribute("data-layout-region"),
      ).toBe(entry.id);
    }
  });
});
