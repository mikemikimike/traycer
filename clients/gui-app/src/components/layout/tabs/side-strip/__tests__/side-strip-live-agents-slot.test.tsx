/**
 * `SideStripLiveAgentsSlot` (D9): the empty element a tab's row draws only
 * while the strip lists live agents AND that row is the active epic tab.
 * `useLiveAgentsSlot`'s own publish/withdraw plumbing is covered in
 * `live-agents-slot-store.test.ts`; this is the row-level gate.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SideStripLiveAgentsSlot } from "@/components/layout/tabs/side-strip/side-strip-live-agents-slot";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import type { HeaderTab } from "@/stores/tabs/types";

function resetStores(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  useSideTabStripStore.setState({ collapsed: false });
}

function activityArrangement() {
  return {
    ...DEFAULT_ARRANGEMENT,
    tabStripPlacement: "left" as const,
    sideStripView: "activity" as const,
  };
}

function epicTab(id: string): HeaderTab {
  return {
    kind: "epic",
    id,
    epicId: id,
    hostId: null,
    name: id,
    route: `/epics/${id}/${id}`,
    icon: null,
    canClose: true,
    canDuplicate: true,
    canOpenInNewWindow: true,
    appearance: null,
  };
}

function settingsTab(): HeaderTab {
  return {
    kind: "settings",
    id: "settings",
    route: "/settings",
    name: "Settings",
    icon: null,
    canDuplicate: false,
    canOpenInNewWindow: false,
    lastPath: null,
    appearance: null,
  };
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("<SideStripLiveAgentsSlot />", () => {
  it("draws nothing while the strip does not list live agents", () => {
    render(<SideStripLiveAgentsSlot tab={epicTab("epic-1")} active />);
    expect(screen.queryByTestId("side-strip-live-agents-slot")).toBeNull();
  });

  it("draws the slot for the active epic tab once the strip lists live agents", () => {
    act(() => {
      useLayoutStore.setState({ arrangement: activityArrangement() });
    });

    render(<SideStripLiveAgentsSlot tab={epicTab("epic-1")} active />);

    expect(screen.getByTestId("side-strip-live-agents-slot")).toBeTruthy();
  });

  it("draws nothing for a row that is not the active tab", () => {
    act(() => {
      useLayoutStore.setState({ arrangement: activityArrangement() });
    });

    render(<SideStripLiveAgentsSlot tab={epicTab("epic-1")} active={false} />);

    expect(screen.queryByTestId("side-strip-live-agents-slot")).toBeNull();
  });

  it("draws nothing for a tab with no session (null or non-epic)", () => {
    act(() => {
      useLayoutStore.setState({ arrangement: activityArrangement() });
    });

    const { rerender } = render(<SideStripLiveAgentsSlot tab={null} active />);
    expect(screen.queryByTestId("side-strip-live-agents-slot")).toBeNull();

    rerender(<SideStripLiveAgentsSlot tab={settingsTab()} active />);
    expect(screen.queryByTestId("side-strip-live-agents-slot")).toBeNull();
  });

  it("withdraws the slot once the predicate flips off (collapsed)", () => {
    act(() => {
      useLayoutStore.setState({ arrangement: activityArrangement() });
    });

    render(<SideStripLiveAgentsSlot tab={epicTab("epic-1")} active />);
    expect(screen.getByTestId("side-strip-live-agents-slot")).toBeTruthy();

    act(() => {
      useSideTabStripStore.getState().setCollapsed(true);
    });

    expect(screen.queryByTestId("side-strip-live-agents-slot")).toBeNull();
  });
});
