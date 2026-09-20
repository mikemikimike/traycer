import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeLayoutEditor,
  openLayoutEditor,
} from "@/lib/layout/editor-session";
import { LAYOUT_EDITOR_LEASE_KEY } from "@/lib/layout/editor-lease";
import { emptyTabStripLayout, tabItemId } from "@/stores/tabs/layout";
import { useEpicCanvasStore } from "@/stores/epics/canvas/store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useTabsStore } from "@/stores/tabs/store";
import type { RegionId } from "@/lib/layout/region-id";
import type { TabRef } from "@/stores/tabs/types";

const navigation = vi.hoisted(() => ({
  activateTabIntent: vi.fn(),
  navigateToSettingsSection: vi.fn(),
}));
vi.mock("@/lib/tab-navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tab-navigation")>()),
  activateTabIntent: navigation.activateTabIntent,
}));
vi.mock("@/lib/settings-navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings-navigation")>()),
  navigateToSettingsSection: navigation.navigateToSettingsSection,
}));

const navigate = vi.fn();
const HISTORY_REF: TabRef = { kind: "history", id: "history" };
const EPIC_REF: TabRef = { kind: "epic", id: "tab-a" };

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function open(target: RegionId | null): boolean {
  // The one door takes a `navigate` because the sample-workspace fallback is a
  // real tab; every other path ignores it.
  return openLayoutEditor({ source: "direct_ui", target, navigate });
}

/** A chat tile live in the active pane of the active Epic tab. */
function seedOpenChat(tileId: string): void {
  useEpicCanvasStore.setState({
    activeTabId: "tab-a",
    canvasByTabId: {
      "tab-a": {
        root: {
          kind: "pane",
          id: "pane-1",
          tabInstanceIds: [tileId],
          activeTabId: tileId,
          previewTabId: null,
          activationHistory: [tileId],
        },
        activePaneId: "pane-1",
        tilesByInstanceId: {},
        sizesByGroupId: {},
      },
    },
  });
}

function sampleTabPresent(): boolean {
  return useTabsStore
    .getState()
    .items.some(
      (item) => item.kind === "tab" && item.ref.kind === "sample-workspace",
    );
}

beforeEach(() => {
  window.localStorage.clear();
  navigation.activateTabIntent.mockReset();
  navigation.navigateToSettingsSection.mockReset();
  navigate.mockReset();
  setViewportWidth(1440);
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useEpicCanvasStore.setState({ activeTabId: null, canvasByTabId: {} });
  useTabsStore.setState({
    ...emptyTabStripLayout(),
    items: [{ kind: "tab", id: tabItemId(HISTORY_REF), ref: HISTORY_REF }],
    activeItemId: tabItemId(HISTORY_REF),
    stripOrder: [HISTORY_REF],
  });
});

afterEach(() => {
  closeLayoutEditor("done");
  useTabsStore.setState({ ...emptyTabStripLayout(), stripOrder: [] });
});

describe("the width gate (L-02, 5.1)", () => {
  it("opens the full-width form instead of a session on a narrow window", () => {
    setViewportWidth(700);

    expect(open(null)).toBe(false);

    expect(useLayoutEditorStore.getState().session).toBeNull();
    expect(navigation.navigateToSettingsSection).toHaveBeenCalledWith("layout");
    // Nothing was claimed on the way out: another window can still open it.
    expect(window.localStorage.getItem(LAYOUT_EDITOR_LEASE_KEY)).toBeNull();
  });
});

describe("choosing the scene (L-15, 5.1)", () => {
  it("lands in the most recently active real chat", () => {
    seedOpenChat("tile-7");

    expect(open(null)).toBe(true);

    const session = useLayoutEditorStore.getState().session;
    expect(session?.scene).toBe("in-place");
    expect(session?.preferredInstanceId).toBe("tile-7");
    expect(navigation.activateTabIntent).not.toHaveBeenCalled();
    expect(sampleTabPresent()).toBe(false);
  });

  it("falls back to the sample workspace only when no chat is open", () => {
    expect(open(null)).toBe(true);

    const session = useLayoutEditorStore.getState().session;
    expect(session?.scene).toBe("sample");
    expect(session?.preferredInstanceId).toBeNull();
    expect(navigation.activateTabIntent).toHaveBeenCalledWith(
      navigate,
      { kind: "sample-workspace" },
      undefined,
    );
    expect(sampleTabPresent()).toBe(true);
  });

  it("remembers what the sample tab interrupted, so closing it goes back", () => {
    open(null);

    const sample = useTabsStore
      .getState()
      .items.find(
        (item) => item.kind === "tab" && item.ref.kind === "sample-workspace",
      );
    expect(sample?.kind === "tab" ? sample.sampleReturnItemId : null).toBe(
      tabItemId(HISTORY_REF),
    );
  });

  it("preselects a deep-link target (5.3)", () => {
    seedOpenChat("tile-7");

    open("minimap");

    expect(useLayoutEditorStore.getState().selected).toBe("minimap");
  });
});

describe("the single-window lease (L-32, 5.3)", () => {
  it("refuses to open while another window holds it", () => {
    window.localStorage.setItem(
      LAYOUT_EDITOR_LEASE_KEY,
      JSON.stringify({ token: "another-window", expiresAt: Date.now() + 5000 }),
    );

    expect(open(null)).toBe(false);
    expect(useLayoutEditorStore.getState().session).toBeNull();
    expect(useLayoutEditorStore.getState().lockedBy).toBe("other-window");
  });

  it("releases the lease on the way out", () => {
    seedOpenChat("tile-7");
    open(null);
    expect(window.localStorage.getItem(LAYOUT_EDITOR_LEASE_KEY)).not.toBeNull();

    closeLayoutEditor("done");

    expect(window.localStorage.getItem(LAYOUT_EDITOR_LEASE_KEY)).toBeNull();
  });
});

describe("leaving (5.3)", () => {
  it("puts the entry snapshot back on Discard and keeps it on Done", () => {
    seedOpenChat("tile-7");
    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });

    closeLayoutEditor("discard");

    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();

    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    closeLayoutEditor("done");

    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
  });

  it("closes the sample tab it opened, but not one the user navigated away from", () => {
    open(null);
    expect(sampleTabPresent()).toBe(true);

    closeLayoutEditor("done");

    expect(sampleTabPresent()).toBe(false);

    open(null);
    expect(sampleTabPresent()).toBe(true);

    closeLayoutEditor("tab-switch");

    expect(sampleTabPresent()).toBe(true);
  });

  it("is a no-op with no session open", () => {
    closeLayoutEditor("done");
    expect(useLayoutEditorStore.getState().session).toBeNull();
  });
});

describe("the canvas going away underneath the editor (5.3)", () => {
  it("exits when another tab takes over", () => {
    seedOpenChat("tile-7");
    open(null);

    useTabsStore.setState((state) => ({
      items: [
        ...state.items,
        { kind: "tab", id: tabItemId(EPIC_REF), ref: EPIC_REF },
      ],
      activeItemId: tabItemId(EPIC_REF),
    }));

    expect(useLayoutEditorStore.getState().session).toBeNull();
  });

  it("exits when the window narrows past the width the editor needs", () => {
    seedOpenChat("tile-7");
    open(null);

    setViewportWidth(700);
    window.dispatchEvent(new Event("resize"));

    expect(useLayoutEditorStore.getState().session).toBeNull();
  });

  it("follows the preferred tile when the pane's active chat changes", () => {
    seedOpenChat("tile-7");
    open(null);

    seedOpenChat("tile-9");

    expect(useLayoutEditorStore.getState().session?.preferredInstanceId).toBe(
      "tile-9",
    );
  });
});
