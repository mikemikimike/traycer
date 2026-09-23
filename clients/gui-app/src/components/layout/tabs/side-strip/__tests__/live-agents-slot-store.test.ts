/**
 * D9: where the strip wants the active task's live agents drawn. The slot
 * store itself (publish/withdraw, one slot per window) and
 * `useLiveAgentsInStrip`'s wiring of the real placement, collapsed and view
 * stores into `liveAgentsInStrip` (`lib/layout/layout-arrangement.ts`, whose
 * own truth table is covered in `layout-arrangement.test.ts`).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  publishLiveAgentsSlot,
  useLiveAgentsInStrip,
  useLiveAgentsSlot,
} from "@/components/layout/tabs/side-strip/live-agents-slot-store";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

function resetStores(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  useSideTabStripStore.setState({ collapsed: false });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("publishLiveAgentsSlot / useLiveAgentsSlot", () => {
  it("is null for a tab with nothing published", () => {
    const { result } = renderHook(() => useLiveAgentsSlot("tab-a"));
    expect(result.current).toBeNull();
  });

  it("publishes the element for its own tab only", () => {
    const element = document.createElement("div");
    const tabA = renderHook(() => useLiveAgentsSlot("tab-a"));
    const tabB = renderHook(() => useLiveAgentsSlot("tab-b"));

    act(() => {
      publishLiveAgentsSlot("tab-a", element);
    });

    expect(tabA.result.current).toBe(element);
    expect(tabB.result.current).toBeNull();
  });

  it("withdraws on the returned cleanup", () => {
    const element = document.createElement("div");
    const { result } = renderHook(() => useLiveAgentsSlot("tab-a"));
    let withdraw: () => void = () => undefined;

    act(() => {
      withdraw = publishLiveAgentsSlot("tab-a", element);
    });
    expect(result.current).toBe(element);

    act(() => {
      withdraw();
    });
    expect(result.current).toBeNull();
  });

  it("a superseded publish's cleanup does not withdraw the newer one", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const { result } = renderHook(() => useLiveAgentsSlot("tab-a"));
    let withdrawFirst: () => void = () => undefined;

    act(() => {
      withdrawFirst = publishLiveAgentsSlot("tab-a", first);
      publishLiveAgentsSlot("tab-a", second);
    });
    expect(result.current).toBe(second);

    act(() => {
      withdrawFirst();
    });
    // The first slot's own cleanup ran after a newer one replaced it; it must
    // not clear the slot out from under the second publish.
    expect(result.current).toBe(second);
  });

  it("publishing for a different tab clears the previous tab's slot", () => {
    const element = document.createElement("div");
    const tabA = renderHook(() => useLiveAgentsSlot("tab-a"));
    const tabB = renderHook(() => useLiveAgentsSlot("tab-b"));

    act(() => {
      publishLiveAgentsSlot("tab-a", element);
    });
    expect(tabA.result.current).toBe(element);

    act(() => {
      publishLiveAgentsSlot("tab-b", element);
    });
    expect(tabA.result.current).toBeNull();
    expect(tabB.result.current).toBe(element);
  });
});

describe("useLiveAgentsInStrip", () => {
  it("is false at the shipped default (top, layered)", () => {
    const { result } = renderHook(() => useLiveAgentsInStrip());
    expect(result.current).toBe(false);
  });

  it("is true once the strip is a vertical, expanded Activity view", () => {
    act(() => {
      useLayoutStore.setState({
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          tabStripPlacement: "left",
          sideStripView: "activity",
        },
      });
    });

    const { result } = renderHook(() => useLiveAgentsInStrip());
    expect(result.current).toBe(true);
  });

  it("follows a live collapse of the strip", () => {
    act(() => {
      useLayoutStore.setState({
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          tabStripPlacement: "right",
          sideStripView: "activity",
        },
      });
    });
    const { result } = renderHook(() => useLiveAgentsInStrip());
    expect(result.current).toBe(true);

    act(() => {
      useSideTabStripStore.getState().setCollapsed(true);
    });
    expect(result.current).toBe(false);
  });

  it("follows a live switch back to Layered", () => {
    act(() => {
      useLayoutStore.setState({
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          tabStripPlacement: "left",
          sideStripView: "activity",
        },
      });
    });
    const { result } = renderHook(() => useLiveAgentsInStrip());
    expect(result.current).toBe(true);

    act(() => {
      useLayoutStore.setState((state) => ({
        arrangement: { ...state.arrangement, sideStripView: "layered" },
      }));
    });
    expect(result.current).toBe(false);
  });
});
