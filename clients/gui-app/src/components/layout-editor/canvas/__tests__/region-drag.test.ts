import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancelLayoutDrag } from "@/components/layout-editor/canvas/drag-engine";
import { armRegionDrag } from "@/components/layout-editor/canvas/region-drag";
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

function dragBy(node: HTMLElement, regionId: RegionId, clientX: number): void {
  const arm = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    armRegionDrag({
      event,
      node,
      regionId,
      onFrame: () => undefined,
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
      clientX: 8,
    }),
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX }),
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
    scene: "in-place",
    entry: "pointer",
    source: "direct_ui",
    preferredInstanceId: null,
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
    dragBy(nodes[0], "attachImage", 60);

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

  it("leaves a member that is not on the canvas in the slot it had", () => {
    // `access` is hidden, so the canvas shows two of the three.
    const nodes = mountToolbar(["attachImage", "agent"]);

    dragBy(nodes[0], "attachImage", 60);

    expect(useLayoutStore.getState().arrangement.toolbarLeft).toEqual([
      "agent",
      "access",
      "attachImage",
    ]);
    expect(useLayoutEditorStore.getState().history.past).toHaveLength(1);
  });

  it("writes nothing when the chip is let go where it started", () => {
    const nodes = mountToolbar(["attachImage", "access", "agent"]);

    dragBy(nodes[0], "attachImage", 12);

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
      onFrame: () => undefined,
    });

    expect(armed).toBe(false);
  });
});
