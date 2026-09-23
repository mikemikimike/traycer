/**
 * `useSideTabJoinedEdge` (D3): the edge a row/tile/pair joins its panel sheet
 * on, gated on the row being WHOLLY inside its row list. A row scrolled
 * partly out is clipped by the scroller, so the join has to fall back to a
 * plain active row rather than draw a bridge the list would cut in half.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { ColumnEdgeContext } from "@/components/layout/column-edge-context";
import { useEpicDndStore } from "@/components/epic-canvas/dnd/dnd-store";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useSideTabJoinedEdge } from "../side-tab-join";

/** A controllable stand-in for the real `IntersectionObserver` (jsdom has none). */
type ObserverEntryLike = { readonly intersectionRatio: number };
type ObserverCallback = (entries: ReadonlyArray<ObserverEntryLike>) => void;
let activeObserverCallbacks: Array<ObserverCallback> = [];

class ControllableIntersectionObserver {
  private readonly callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
    activeObserverCallbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    activeObserverCallbacks = activeObserverCallbacks.filter(
      (registered) => registered !== this.callback,
    );
  }
  takeRecords(): ReadonlyArray<ObserverEntryLike> {
    return [];
  }
}

function reportRatio(ratio: number): void {
  act(() => {
    for (const callback of activeObserverCallbacks) {
      callback([{ intersectionRatio: ratio }]);
    }
  });
}

/** The hook's own caller: a CHILD of the edge provider, as a real row is. */
function Row(): ReactNode {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const joined = useSideTabJoinedEdge(true, () => true, node);
  return <div ref={setNode} data-testid="row" data-joined={joined ?? "none"} />;
}

/** Mounts the hook under a real row list ancestor, at the given edge. */
function Harness(props: { readonly edge: EdgeSide }): ReactNode {
  return (
    <ColumnEdgeContext.Provider value={props.edge}>
      <div data-strip-axis="y">
        <Row />
      </div>
    </ColumnEdgeContext.Provider>
  );
}

function joinedValue(): string | undefined {
  return screen.getByTestId("row").dataset.joined;
}

beforeEach(() => {
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useEpicDndStore.setState(useEpicDndStore.getInitialState(), true);
  activeObserverCallbacks = [];
});

afterEach(() => {
  cleanup();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useEpicDndStore.setState(useEpicDndStore.getInitialState(), true);
});

describe("useSideTabJoinedEdge", () => {
  it("starts joined, un-joins once the observed row falls below full intersection, and re-joins at ratio 1", () => {
    const restore = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: ControllableIntersectionObserver,
    });

    render(<Harness edge="left" />);

    // Starts true, so the row joins on its first frame before any report.
    expect(joinedValue()).toBe("left");

    reportRatio(0.4);
    expect(joinedValue()).toBe("none");

    reportRatio(1);
    expect(joinedValue()).toBe("left");

    if (restore === undefined) {
      Reflect.deleteProperty(globalThis, "IntersectionObserver");
    } else {
      Object.defineProperty(globalThis, "IntersectionObserver", restore);
    }
  });

  it("joins as before when IntersectionObserver is unavailable (never watches, never un-joins)", () => {
    const restore = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    Reflect.deleteProperty(globalThis, "IntersectionObserver");

    render(<Harness edge="left" />);

    expect(joinedValue()).toBe("left");

    if (restore !== undefined) {
      Object.defineProperty(globalThis, "IntersectionObserver", restore);
    }
  });
});
