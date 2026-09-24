import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLeftPanelDefinition } from "@/components/epic-canvas/sidebar/left-panel-registry";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/canvas-attributes";
import { SampleWorkspaceRail } from "@/components/sample-workspace/sample-workspace-rail";
import {
  insertRailDivider,
  unstackRail,
} from "@/lib/layout/layout-arrangement";
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
 * the nine icons and whatever dividers the user has added are picked up - and
 * what it has to be is `arrangement.rail` itself, entry for entry, inside one
 * cluster.
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

/** One divider in the rail, which is the only way there is one (L-155). */
function addDivider(index: number): void {
  const { arrangement } = useLayoutStore.getState();
  useLayoutStore
    .getState()
    .setArrangement(insertRailDivider(arrangement, index));
}

/** The rail with its one shipped stack taken apart, for a flat-rail case. */
function unstackShippedPair(): void {
  const { arrangement } = useLayoutStore.getState();
  useLayoutStore
    .getState()
    .setArrangement(unstackRail(arrangement, "stack:railAgents+railArtifacts"));
}

describe("the sample workspace's icon rail", () => {
  it("is nine icons and nothing else by default (L-155, L-166)", () => {
    render(<SampleWorkspaceRail />);

    const nodes = railEntries();
    // Eight things in the column, because the shipped stack draws as ONE
    // group icon (G3) - nine panels all the same.
    expect(nodes).toHaveLength(8);
    expect(screen.getAllByTestId("epic-rail-stack")).toHaveLength(1);
    // Only the top's depiction carries a canvas region (G3): the bottom
    // member has no node of its own to drag or measure.
    expect(
      screen
        .getByTestId("epic-rail-stack")
        .querySelectorAll("[data-layout-region]"),
    ).toHaveLength(1);
    expect(
      screen
        .getByLabelText("Sample sidebar")
        .querySelectorAll("[data-layout-region]"),
    ).toHaveLength(8);
    expect(screen.queryAllByTestId("epic-rail-divider")).toHaveLength(0);
    // The rail's own `gap-1` is the whole of the spacing: no icon carries a
    // margin of its own, so the rhythm is uniform down the column.
    expect(screen.getByLabelText("Sample sidebar").className).toContain(
      "gap-1",
    );
    for (const node of nodes)
      expect(node.className).not.toMatch(/(?:^|\s)-?m[xytblre]?-/);
  });

  it("draws a divider the user added as a gap at rest, and its panels in order", () => {
    // On a flat rail, so the walk below is one entry per child: the capsule
    // has its own case above.
    unstackShippedPair();
    addDivider(2);
    render(<SampleWorkspaceRail />);

    const rail = useLayoutStore.getState().arrangement.rail;
    expect(rail.filter((entry) => entry.kind === "divider")).toHaveLength(1);
    // The panels are the rail's, in order, with the divider between them
    // drawing space rather than a name (L-140).
    expect(
      railEntries().map((node) => node.getAttribute("aria-label")),
    ).toEqual(
      rail.map((entry) =>
        entry.kind === "panel"
          ? getLeftPanelDefinition(leftPanelIdForRailRegion(entry.id)).title
          : null,
      ),
    );
    const dividers = screen.getAllByTestId("epic-rail-divider");
    expect(dividers).toHaveLength(1);
    // At rest it is space and nothing else: no rule inside it, no member to
    // grab, and no name to announce.
    expect(dividers[0].childElementCount).toBe(0);
    expect(dividers[0].hasAttribute("data-rail-divider-resting")).toBe(true);
    expect(dividers[0].getAttribute("data-layout-member")).toBeNull();
    // The gap it draws, asserted as the CLASS rather than as a measurement:
    // jsdom lays nothing out, so `getBoundingClientRect` here is all zeroes
    // and only the class can carry the design intent. `h-1` is 4px, the same
    // as the column's own `gap-1`, so two icons a divider separates sit three
    // gaps apart instead of one (R5R-13). A real measurement of this lives in
    // the Chrome driver's rail plans.
    expect(dividers[0].className).toContain("h-1");
    expect(dividers[0].className).toContain("w-full");
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

  /**
   * S-32: the epic sidebar's own side is a "Move sidebar to..." item in the
   * same shared menu, named for the direction it MOVES TO rather than the
   * side it is currently on.
   */
  it("offers 'Move sidebar to right' for the default (left) side, and writes sidebarSide on click", () => {
    render(<SampleWorkspaceRail />);

    fireEvent.contextMenu(screen.getByLabelText("Sample sidebar"));
    expect(screen.getByTestId("epic-rail-move-sidebar").textContent).toBe(
      "Move sidebar to right",
    );

    fireEvent.click(screen.getByTestId("epic-rail-move-sidebar"));

    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");
    // At rest, `recordGesture` is a pass-through: nothing lands on the undo
    // stack for a write made outside a customizing session.
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(0);
  });

  it("offers 'Move sidebar to left' once the side is right, and writes it back on click", () => {
    useLayoutStore.getState().setArrangement({
      ...useLayoutStore.getState().arrangement,
      sidebarSide: "right",
    });
    render(<SampleWorkspaceRail />);

    fireEvent.contextMenu(screen.getByLabelText("Sample sidebar"));
    expect(screen.getByTestId("epic-rail-move-sidebar").textContent).toBe(
      "Move sidebar to left",
    );

    fireEvent.click(screen.getByTestId("epic-rail-move-sidebar"));

    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("left");
  });

  it("records a sidebar-side move as a gesture while a session is open, so Undo takes it back", () => {
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      startedAt: 0,
    });
    render(<SampleWorkspaceRail />);

    fireEvent.contextMenu(screen.getByLabelText("Sample sidebar"));
    fireEvent.click(screen.getByTestId("epic-rail-move-sidebar"));

    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(1);

    useLayoutEditorStore.getState().undo();

    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("left");
  });

  it("makes every entry a draggable member of the rail in a session", () => {
    addDivider(2);
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
      // A panel is a region and a divider is not, so they name themselves
      // through different attributes - and the drop reads both.
      expect(
        node.getAttribute("data-layout-member") ??
          node.getAttribute("data-layout-region"),
      ).toBe(entry.id);
      expect(node.hasAttribute("data-rail-divider-resting")).toBe(false);
    }
  });
});
