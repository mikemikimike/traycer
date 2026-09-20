import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
      scene: "in-place",
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

beforeEach(() => {
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({ instances: new Map() });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
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

    fireEvent.pointerMove(view.getByTestId("map-inner"));

    expect(useLayoutEditorStore.getState().hovered).toBe("minimap");
    expect(chip()?.textContent).toBe("Minimap");
    expect(chip()?.hidden).toBe(false);
  });

  it("drops the hover on a pointer over the column's own chrome", () => {
    openSession("tile-a");
    const view = render(
      <Canvas
        regions={[{ regionId: "minimap", instanceId: "tile-a", testId: "map" }]}
      />,
    );
    fireEvent.pointerMove(view.getByTestId("map-inner"));
    expect(useLayoutEditorStore.getState().hovered).toBe("minimap");

    fireEvent.pointerMove(view.getByTestId("column"));

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

    fireEvent.pointerMove(document.body);

    expect(useLayoutEditorStore.getState().hovered).toBe("minimap");
  });

  it("puts a top-bar region's chip underneath it", () => {
    openSession(null);
    const view = render(
      <Canvas
        regions={[{ regionId: "homeTab", instanceId: null, testId: "home" }]}
      />,
    );

    fireEvent.pointerMove(view.getByTestId("home-inner"));

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
