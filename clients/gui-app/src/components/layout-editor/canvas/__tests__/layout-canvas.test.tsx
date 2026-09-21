import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelLayoutDrag,
  layoutDragActive,
} from "@/components/layout-editor/canvas/drag-engine";
import { useLayoutCanvas } from "@/components/layout-editor/canvas/layout-canvas";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

/**
 * The app column plus two regions, mounted the way ticket 07's shell will
 * mount them: the hook is handed the column element and nothing else.
 */
function Canvas(props: {
  readonly regions: ReadonlyArray<{
    readonly regionId: RegionId;
    readonly instanceId: string | null;
    readonly testId: string;
  }>;
}): ReactElement {
  const [column, setColumn] = useState<HTMLElement | null>(null);
  useLayoutCanvas(column);
  return (
    <div ref={setColumn} data-testid="column">
      {props.regions.map((region) => (
        <Region key={region.testId} {...region} />
      ))}
    </div>
  );
}

function Region(props: {
  readonly regionId: RegionId;
  readonly instanceId: string | null;
  readonly testId: string;
}): ReactElement {
  const { ref } = useLayoutRegion({
    regionId: props.regionId,
    instanceId: props.instanceId,
  });
  return (
    <div ref={ref} data-testid={props.testId}>
      <span data-testid={`${props.testId}-inner`}>inner</span>
    </div>
  );
}

function openSession(preferredInstanceId: string | null): void {
  act(() => {
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      preferredInstanceId,
      startedAt: 0,
    });
  });
}

function chip(): HTMLElement | null {
  const element = document.querySelector("[data-layout-hover-chip]");
  return element instanceof HTMLElement ? element : null;
}

function ring(): HTMLElement | null {
  const element = document.querySelector("[data-layout-selection-ring]");
  return element instanceof HTMLElement ? element : null;
}

/** The pointer the canvas decorates for: a mouse, never a touch (C-09). */
const MOUSE = { pointerType: "mouse" } as const;

/**
 * A node whose viewport box is a mutable fact, which is what a reflow is: a
 * dock switch moves the app column sideways without resizing anything in it.
 */
function movable(node: HTMLElement, rect: DOMRect): (next: DOMRect) => void {
  let current = rect;
  node.getBoundingClientRect = (): DOMRect => current;
  return (next) => {
    current = next;
  };
}

/**
 * The ring places itself on its first animation frame, so its box is a fact
 * about the frame after `track`, never about the call.
 */
async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Long enough for a ring to arrive AND for a parking loop to have parked. */
async function flushFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await flushFrame();
}

beforeEach(() => {
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({ instances: new Map() });
});

afterEach(() => {
  cancelLayoutDrag();
  cleanup();
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.getState().setDockMode("right");
  document.documentElement.removeAttribute("data-reduce-panel-motion");
});

describe("the session's canvas", () => {
  it("mounts nothing until a session opens, and leaves nothing behind", () => {
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );
    expect(chip()).toBeNull();
    expect(ring()).toBeNull();
    expect(view.getByTestId("column").hasAttribute("data-layout-editing")).toBe(
      false,
    );

    openSession("tile-a");

    expect(chip()).not.toBeNull();
    expect(ring()).not.toBeNull();
    expect(view.getByTestId("column").getAttribute("data-layout-editing")).toBe(
      "1",
    );

    act(() => {
      useLayoutEditorStore.getState().endSession();
    });

    expect(chip()).toBeNull();
    expect(ring()).toBeNull();
    expect(view.getByTestId("column").hasAttribute("data-layout-editing")).toBe(
      false,
    );
  });

  it("resolves a pointer inside a region to the region, not to the node under it", () => {
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );

    fireEvent.pointerMove(view.getByTestId("map-inner"), MOUSE);

    expect(useLayoutEditorStore.getState().hovered).toBe("minimap");
    // The name AND the state the region is in, which is the question hovering
    // asks (C-05). The name alone labelled something already under the pointer.
    expect(chip()?.textContent).toBe("Minimap · Right");
    expect(chip()?.hidden).toBe(false);
  });

  it("refuses hover for a pointer that cannot rest on a region (C-09)", () => {
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );

    fireEvent.pointerMove(view.getByTestId("map-inner"), {
      pointerType: "touch",
    });

    expect(useLayoutEditorStore.getState().hovered).toBeNull();
    expect(chip()?.hidden).toBe(true);
    expect(view.getByTestId("map").hasAttribute("data-hover")).toBe(false);
  });

  it("drops the hover decoration off the region it just selected (C-08)", () => {
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );
    fireEvent.pointerMove(view.getByTestId("map-inner"), MOUSE);
    expect(view.getByTestId("map").getAttribute("data-hover")).toBe("1");

    fireEvent.pointerDown(view.getByTestId("map-inner"));
    // The pointer has not left, so `pointermove` keeps setting the hover; what
    // changes is that a selected region no longer WEARS it. Otherwise it wears
    // the ring, the outline and the chip at once.
    fireEvent.pointerMove(view.getByTestId("map-inner"), MOUSE);

    expect(view.getByTestId("map").hasAttribute("data-hover")).toBe(false);
    expect(view.getByTestId("map").getAttribute("data-selected")).toBe("1");
    expect(chip()?.hidden).toBe(true);
  });

  it("drops the hover on a pointer over the column's own chrome", () => {
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );
    fireEvent.pointerMove(view.getByTestId("map-inner"), MOUSE);
    expect(useLayoutEditorStore.getState().hovered).toBe("minimap");

    fireEvent.pointerMove(view.getByTestId("column"), MOUSE);

    expect(useLayoutEditorStore.getState().hovered).toBeNull();
    expect(chip()?.hidden).toBe(true);
  });

  it("leaves a hover the inspector set alone while the pointer is outside the column", () => {
    openSession("tile-a");
    render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );
    act(() => {
      useLayoutEditorStore.getState().setHovered("minimap");
    });

    fireEvent.pointerMove(document.body, MOUSE);

    expect(useLayoutEditorStore.getState().hovered).toBe("minimap");
  });

  it("puts a top-bar region's chip underneath it", () => {
    openSession(null);
    const view = render(
      <Canvas
        regions={[{ regionId: "homeTab", instanceId: null, testId: "home" }]}
      />,
    );

    fireEvent.pointerMove(view.getByTestId("home-inner"), MOUSE);

    expect(chip()?.getAttribute("data-placement")).toBe("below");
  });

  it("selects the region under a pointer press and drops keyboard navigation", async () => {
    openSession("tile-a");
    useLayoutEditorStore.setState({ keyboardNav: true });
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );

    fireEvent.pointerDown(view.getByTestId("map-inner"));

    expect(useLayoutEditorStore.getState().selected).toBe("minimap");
    expect(useLayoutEditorStore.getState().keyboardNav).toBe(false);
    await flushFrame();
    expect(ring()?.hidden).toBe(false);
  });

  // The shell on screen during an exit is a snapshot of where the elements
  // WERE, so a drag armed against it would measure boxes that are about to
  // move. The press still selects - that is L-69 - it just carries nothing.
  it("selects but arms no drag on a press while the session is leaving", () => {
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[
          { regionId: "attachImage", instanceId: "tile-a", testId: "attach" },
        ]}
      />,
    );

    fireEvent.pointerDown(view.getByTestId("attach-inner"), { button: 0 });
    expect(layoutDragActive()).toBe(true);
    cancelLayoutDrag();

    act(() => {
      useLayoutEditorStore.setState({ leaving: true });
    });
    fireEvent.pointerDown(view.getByTestId("attach-inner"), { button: 0 });

    expect(useLayoutEditorStore.getState().selected).toBe("attachImage");
    expect(layoutDragActive()).toBe(false);
  });

  it("keeps the ring on a region the dock switch moved sideways (L-90)", async () => {
    // The owner's bug, driven through the real path: `setDockMode` writes the
    // EDITOR store, and the app column reflows 320px sideways beside the
    // panel. The selected region does not change size, nothing scrolls and no
    // window resize fires, so every wake the parked loop listened for stays
    // silent - and the ring used to be left drawn around the inspector.
    document.documentElement.setAttribute("data-reduce-panel-motion", "");
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );
    const move = movable(
      view.getByTestId("map"),
      new DOMRect(700, 120, 200, 30),
    );
    act(() => {
      useLayoutEditorStore.getState().select("minimap");
    });
    // Several frames, so the ring has ARRIVED and any design that parks on
    // arrival has parked before the switch below.
    await flushFrames(4);
    expect(ring()?.style.transform).toBe("translate(697.00px, 117.00px)");

    move(new DOMRect(380, 120, 200, 30));
    act(() => {
      useLayoutEditorStore.getState().setDockMode("left");
    });
    await flushFrame();

    expect(ring()?.style.transform).toBe("translate(377.00px, 117.00px)");
  });

  it("puts the ring on the preferred tile's instance, and hides it with no selection", async () => {
    openSession("tile-b");
    const view = render(
      <Canvas
        regions={[
          { regionId: "minimap", instanceId: "tile-a", testId: "a" },
          { regionId: "minimap", instanceId: "tile-b", testId: "b" },
        ]}
      />,
    );

    act(() => {
      useLayoutEditorStore.getState().select("minimap");
    });

    // The ring is drawn around the preferred instance; every other instance
    // carries the static outline instead (L-23).
    expect(view.getByTestId("b").getAttribute("data-layout-anchor")).toBe(
      "selected",
    );
    expect(view.getByTestId("a").getAttribute("data-selected")).toBe("1");
    await flushFrame();
    expect(ring()?.hidden).toBe(false);

    act(() => {
      useLayoutEditorStore.getState().select(null);
    });

    expect(ring()?.hidden).toBe(true);
  });
});
