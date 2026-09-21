import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancelLayoutDrag } from "@/components/layout-editor/canvas/drag-engine";
import {
  armRegionDrag,
  LAYOUT_CLUSTER_ATTRIBUTE,
} from "@/components/layout-editor/canvas/region-drag";
import { DEFAULT_DOCK_ORDER } from "@/lib/layout/layout-arrangement";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The canvas half of a reorder, end to end: an element picked up, and the
 * arrangement it leaves behind.
 *
 * The toolbar is built here rather than rendered, for the same reason the
 * engine's own test stubs rects - jsdom lays nothing out - but everything
 * between the pointer and the store is the real thing: the registry decides
 * which group the element is in, the engine decides which slot it landed in,
 * and `layout-gestures.ts` writes it as one recorded gesture.
 */

const CHIP_WIDTH = 30;
const CHIP_GAP = 4;

/** The composer's own shape: each member inside a `display: contents` span. */
function mountToolbar(
  regionIds: ReadonlyArray<RegionId>,
): ReadonlyArray<HTMLElement> {
  const cluster = document.createElement("div");
  cluster.setAttribute(LAYOUT_CLUSTER_ATTRIBUTE, "");
  document.body.append(cluster);
  const clusterWidth = regionIds.length * (CHIP_WIDTH + CHIP_GAP) - CHIP_GAP;
  cluster.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: clusterWidth,
    bottom: 24,
    width: clusterWidth,
    height: 24,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return regionIds.map((regionId, index) => {
    const wrapper = document.createElement("span");
    cluster.append(wrapper);
    const node = document.createElement("div");
    node.setAttribute("data-layout-region", regionId);
    node.setAttribute("data-layout-group", "toolbarLeft");
    node.setAttribute("data-layout-draggable", "1");
    const left = index * (CHIP_WIDTH + CHIP_GAP);
    node.getBoundingClientRect = () => ({
      left,
      top: 0,
      right: left + CHIP_WIDTH,
      bottom: 24,
      width: CHIP_WIDTH,
      height: 24,
      x: left,
      y: 0,
      toJSON: () => ({}),
    });
    node.setPointerCapture = () => undefined;
    node.releasePointerCapture = () => undefined;
    node.hasPointerCapture = () => true;
    wrapper.append(node);
    return node;
  });
}

const ROW_HEIGHT = 40;
// Far enough below the dock that the two containers are unmistakably apart on
// the vertical axis, which is the axis the engine infers from the first two
// boxes - and near enough that a drag can still reach a chip, so a build that
// took the split cluster really would write something.
const CHIP_STRIP_TOP = 160;

/**
 * The dock's own shape, with the chip-sized rows drawn WHERE THE APP DRAWS
 * THEM - in the composer's compact strip, a container of its own with the
 * whole transcript between it and the dock (G3-01).
 */
function mountDock(
  rows: ReadonlyArray<{
    readonly regionId: RegionId;
    readonly chip: boolean;
  }>,
): ReadonlyArray<HTMLElement> {
  const tile = document.createElement("div");
  document.body.append(tile);
  const dock = box(tile, 0, rows.length * ROW_HEIGHT);
  const strip = box(tile, CHIP_STRIP_TOP, 24);
  let dockTop = 0;
  let chipLeft = 0;
  const nodes: HTMLElement[] = [];
  for (const row of rows) {
    const node = document.createElement("div");
    node.setAttribute("data-layout-region", row.regionId);
    node.setAttribute("data-layout-group", "dock");
    node.setAttribute("data-layout-draggable", "1");
    node.setPointerCapture = () => undefined;
    node.releasePointerCapture = () => undefined;
    node.hasPointerCapture = () => true;
    if (row.chip) {
      strip.append(node);
      stubRect(node, {
        left: chipLeft,
        top: CHIP_STRIP_TOP,
        width: 30,
        height: 24,
      });
      chipLeft += 34;
    } else {
      dock.append(node);
      stubRect(node, { left: 0, top: dockTop, width: 300, height: ROW_HEIGHT });
      dockTop += ROW_HEIGHT;
    }
    nodes.push(node);
  }
  return nodes;
}

/** One surface's own laid-out box, marked the way the real surfaces mark it. */
function box(parent: HTMLElement, top: number, height: number): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(LAYOUT_CLUSTER_ATTRIBUTE, "");
  parent.append(node);
  stubRect(node, { left: 0, top, width: 300, height });
  return node;
}

function stubRect(
  node: HTMLElement,
  rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): void {
  node.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

function dragBy(
  node: HTMLElement,
  regionId: RegionId,
  to: { readonly clientX?: number; readonly clientY?: number },
): void {
  const arm = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    armRegionDrag({
      event,
      node,
      regionId,
    });
  };
  node.addEventListener("pointerdown", arm);
  node.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    }),
  );
  node.removeEventListener("pointerdown", arm);
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      clientX: to.clientX === undefined ? 0 : 8,
      clientY: to.clientY === undefined ? 0 : 8,
    }),
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      clientX: to.clientX ?? 0,
      clientY: to.clientY ?? 0,
    }),
  );
  window.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
  );
}

beforeEach(() => {
  // Reduced motion, so the release is placed rather than thrown and the drop
  // lands in the same tick as the pointer leaving.
  document.documentElement.setAttribute("data-reduce-panel-motion", "");
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.getState().beginSession({
    entry: "pointer",
    source: "direct_ui",
    startedAt: 0,
  });
});

afterEach(() => {
  cancelLayoutDrag();
  useLayoutEditorStore.getState().endSession();
  document.documentElement.removeAttribute("data-reduce-panel-motion");
  document.body.replaceChildren();
});

describe("dragging a region on the canvas", () => {
  it("reorders its cluster as ONE history entry, and undo puts it back", () => {
    const nodes = mountToolbar(["attachImage", "access", "agent"]);

    // Far enough right for the first chip's centre to pass the second's: the
    // chips are 30 wide and 4 apart, so the neighbour's centre is at 49.
    dragBy(nodes[0], "attachImage", { clientX: 60 });

    expect(useLayoutStore.getState().arrangement.toolbarLeft).toEqual([
      "access",
      "attachImage",
      "agent",
    ]);
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(1);

    useLayoutEditorStore.getState().undo();

    expect(useLayoutStore.getState().arrangement.toolbarLeft).toEqual([
      "attachImage",
      "access",
      "agent",
    ]);
  });

  it("keeps a member that is not on the canvas beside its own neighbours", () => {
    // `access` is hidden, so the canvas shows two of the three.
    const nodes = mountToolbar(["attachImage", "agent"]);

    dragBy(nodes[0], "attachImage", { clientX: 60 });

    expect(useLayoutStore.getState().arrangement.toolbarLeft).toEqual([
      "access",
      "agent",
      "attachImage",
    ]);
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(1);
  });

  it("writes nothing when the chip is let go where it started", () => {
    const nodes = mountToolbar(["attachImage", "access", "agent"]);

    dragBy(nodes[0], "attachImage", { clientX: 12 });

    expect(useLayoutStore.getState().arrangement.toolbarLeft).toEqual([
      "attachImage",
      "access",
      "agent",
    ]);
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(0);
  });

  it("does not pick up a region that has no order of its own", () => {
    const node = document.createElement("div");
    node.setAttribute("data-layout-region", "minimap");
    document.body.append(node);

    const armed = armRegionDrag({
      event: new PointerEvent("pointerdown", { pointerId: 1, button: 0 }),
      node,
      regionId: "minimap",
    });

    expect(armed).toBe(false);
  });
});

/**
 * The dock is the one group the app draws in TWO containers: a chip-sized row
 * stands in the composer's compact strip while its full-size siblings stay in
 * the dock, with the whole transcript between them (G3-01).
 */
describe("a dock whose members are not all the same size", () => {
  it("reorders the rows drawn in the dock, leaving the chip where it stands", () => {
    // One chip in the strip, two full rows in the dock: the pair on screen in
    // the dock is `changedFiles` then `background`, which is NOT their stored
    // pair, so an index into the drawn order picks the wrong member out of the
    // stored one.
    const nodes = mountDock([
      { regionId: "changedFiles", chip: false },
      { regionId: "runningAgents", chip: true },
      { regionId: "background", chip: false },
    ]);

    // `background` is the second dock row; pulled a row and a half up, its
    // centre passes the first row's.
    dragBy(nodes[2], "background", { clientY: -60 });

    // `background` moved; `runningAgents`, drawn in the other container and no
    // part of this gesture, keeps its place after `changedFiles`.
    expect(useLayoutStore.getState().arrangement.dock).toEqual([
      "background",
      "changedFiles",
      "runningAgents",
    ]);
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(1);
  });

  it("reorders the chips drawn in the strip, leaving the row where it stands", () => {
    const nodes = mountDock([
      { regionId: "changedFiles", chip: true },
      { regionId: "runningAgents", chip: false },
      { regionId: "background", chip: true },
    ]);

    // The chips sit side by side, so this cluster runs on the other axis:
    // `background` is the second chip, pulled left past the first.
    dragBy(nodes[2], "background", { clientX: -40 });

    expect(useLayoutStore.getState().arrangement.dock).toEqual([
      "background",
      "changedFiles",
      "runningAgents",
    ]);
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(1);
  });

  it("picks up nothing from a container holding one member", () => {
    // The one full row has no sibling drawn beside it; the two chips are in
    // the strip, and reaching across to them would infer the axis over the
    // whole transcript and clamp against the tile. The inspector's list still
    // reorders the whole group (L-68).
    const nodes = mountDock([
      { regionId: "changedFiles", chip: true },
      { regionId: "runningAgents", chip: false },
      { regionId: "background", chip: true },
    ]);

    dragBy(nodes[1], "runningAgents", { clientY: 200 });

    expect(useLayoutStore.getState().arrangement.dock).toEqual(
      DEFAULT_DOCK_ORDER,
    );
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(0);
  });
});
