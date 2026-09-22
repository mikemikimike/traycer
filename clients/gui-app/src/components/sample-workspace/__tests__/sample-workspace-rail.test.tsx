import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLeftPanelDefinition } from "@/components/epic-canvas/sidebar/left-panel-registry";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/canvas-attributes";
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
  it("draws its boundaries as gaps at rest, and its panels in order", () => {
    render(<SampleWorkspaceRail />);

    const rail = useLayoutStore.getState().arrangement.rail;
    // A group break is not an element until the user is customizing (L-140),
    // so at rest the rail is exactly its panels.
    expect(
      railEntries().map((node) => node.getAttribute("aria-label")),
    ).toEqual(
      rail.flatMap((entry) =>
        entry.kind === "divider"
          ? []
          : [getLeftPanelDefinition(leftPanelIdForRailRegion(entry.id)).title],
      ),
    );
    expect(screen.queryAllByTestId("epic-rail-divider")).toHaveLength(0);
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

  /**
   * The menu the real sidebar has, on the rail the editor actually opens on
   * (L-144). It answered a right-click with nothing, so the sample rail - the
   * only rail a user customizing the sidebar points at (L-87) - had no way to
   * hide a panel or to reach the editor on one.
   *
   * The items are the REAL rail's, from the one module both draw: the same
   * "Hide '<panel>'", the same checkbox list, the same way in. They write the
   * layout store through the same gesture recording every other writer of
   * those values uses.
   */
  it("offers the real rail's menu for the icon the pointer was over", () => {
    render(<SampleWorkspaceRail />);

    fireEvent.contextMenu(screen.getByLabelText("Browsers"));

    expect(screen.getByTestId("epic-rail-context-menu")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-hide-pointed-panel").textContent).toBe(
      "Hide 'Browsers'",
    );
    expect(screen.getByTestId("customize-layout-menu-item")).not.toBeNull();
  });

  it("names whichever icon was pointed at, from the one root", () => {
    render(<SampleWorkspaceRail />);

    fireEvent.contextMenu(screen.getByLabelText("Terminals"));

    expect(screen.getByTestId("epic-rail-hide-pointed-panel").textContent).toBe(
      "Hide 'Terminals'",
    );
  });

  // The rail's own empty space still opens the list, which is the only way
  // back to a panel with no icon left to aim at.
  it("opens the panel list over the rail's own space, naming no panel", () => {
    render(<SampleWorkspaceRail />);

    fireEvent.contextMenu(screen.getByLabelText("Sample sidebar"));

    expect(screen.getByTestId("epic-rail-context-menu")).not.toBeNull();
    expect(screen.queryByTestId("epic-rail-hide-pointed-panel")).toBeNull();
  });

  /**
   * A hide made from this menu during a session is an ordinary layout gesture
   * (L-18, L-150(1)).
   *
   * The three things that go wrong when it is not are all measured here, and
   * the third is the quiet one: a write made outside the editor's own depth is
   * read by `watchExternalLayoutWrites` as ANOTHER WINDOW's and REBASES the
   * entry snapshot onto it, so "Discard changes" would come back with the
   * panel still hidden and nothing on screen to say why.
   */
  it("records a hide as a gesture, so Undo and Discard both take it back", () => {
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      startedAt: 0,
    });
    const entry = useLayoutEditorStore.getState().entrySnapshot;
    render(<SampleWorkspaceRail />);

    // One other gesture first, so Undo has somewhere to go past the hide and
    // the order of the two is observable.
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setBasePreset("compact");
    });
    fireEvent.contextMenu(screen.getByLabelText("Browsers"));
    fireEvent.click(screen.getByTestId("epic-rail-hide-pointed-panel"));

    expect(useLayoutStore.getState().overrides.railBrowsers).toEqual({
      shown: "hidden",
    });
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(2);
    // The entry snapshot did NOT move: the write was the editor's own.
    expect(useLayoutEditorStore.getState().entrySnapshot).toEqual(entry);

    useLayoutEditorStore.getState().undo();

    // The hide came back first, and the earlier gesture still stands.
    expect(useLayoutStore.getState().overrides.railBrowsers).toBeUndefined();
    expect(useLayoutStore.getState().basePreset).toBe("compact");

    useLayoutEditorStore.getState().discard();

    expect(useLayoutStore.getState().basePreset).toBe("default");
    expect(useLayoutStore.getState().overrides).toEqual({});
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
