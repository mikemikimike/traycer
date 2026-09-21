import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics, AnalyticsEvent } from "@/lib/analytics";
import {
  abandonLayoutEditorSession,
  closeLayoutEditor,
  openLayoutEditor,
} from "@/lib/layout/editor-session";
import { setLayoutInspectorNode } from "@/lib/layout/editor-motion";
import {
  installFakeViewTransitions,
  type FakeViewTransition,
} from "@/lib/layout/test-support/fake-view-transition";
import { LAYOUT_EDITOR_LEASE_KEY } from "@/lib/layout/editor-lease";
import { LAYOUT_EDITOR_MIN_WIDTH } from "@/lib/layout/editor-width";
import { registerTileRect } from "@/lib/browser-view/tiles/tile-rect-registry";
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

/**
 * The door, driven the way a pointer entry actually drives it.
 *
 * `document.startViewTransition` is installed for the whole suite, so every
 * `open` and `close` below takes the production branch: the session change is
 * deferred into the transition's update callback rather than landing inside the
 * call. A suite without it reads `session` straight after `open(...)` and
 * passes for a reason that does not exist in a browser - which is exactly how
 * the re-open-during-exit race got through gate 1.
 *
 * The three cases that are ABOUT the guarded fallback turn a real guard on
 * (`data-reduce-panel-motion`) rather than uninstalling the API.
 */
const navigate = vi.fn();
let transitions: Array<FakeViewTransition> = [];
let uninstallViewTransitions: () => void = () => undefined;
let deregisterTile: (() => void) | null = null;
const HISTORY_REF: TabRef = { kind: "history", id: "history" };
const EPIC_REF: TabRef = { kind: "epic", id: "tab-a" };

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

/**
 * Every update callback the browser has queued, in the order it would run
 * them: starting a transition skips the one already running, and a skipped
 * transition's callback is a task ahead of the new one's.
 */
function drainTransitions(): void {
  while (transitions.length > 0) transitions.shift()?.runUpdate();
}

function open(target: RegionId | null): boolean {
  // The one door takes a `navigate` because the sample-workspace fallback is a
  // real tab; every other path ignores it.
  const opened = openLayoutEditor({
    source: "direct_ui",
    entry: "pointer",
    target,
    navigate,
  });
  drainTransitions();
  return opened;
}

/** Leaving, then the frame the view transition defers the teardown to. */
function close(reason: "done" | "discard" | "tab-switch"): void {
  closeLayoutEditor(reason);
  drainTransitions();
}

/**
 * The guard that puts both halves of the door on the fallback branch, which is
 * the only branch the inspector's own slide-out exists on.
 */
function forceReducedMotion(): void {
  document.documentElement.setAttribute("data-reduce-panel-motion", "");
}

/** A tile registration that makes `aNativeTileIsPresented()` true (C-18). */
function presentNativeTile(): void {
  const surface = document.createElement("div");
  surface.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  deregisterTile = registerTileRect(
    {
      viewTabId: "view-1",
      paneId: "pane-1",
      tileInstanceId: "tile-1",
      pageSessionId: "page-1",
    },
    surface,
  );
}

/**
 * The inspector as the fallback exit finds it: on screen, with an exit
 * animation still playing. jsdom runs no animations at all, so a suite that
 * does not stand one up can only ever see the immediate teardown.
 */
function mountAnimatedInspector(): { readonly finishSlideOut: () => void } {
  const inspector = document.createElement("div");
  inspector.setAttribute("data-layout-inspector", "");
  document.body.append(inspector);
  let settle: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });
  Object.defineProperty(inspector, "getAnimations", {
    configurable: true,
    writable: true,
    value: () => [{ finished }],
  });
  // The shell's ref callback is how the door learns which element to animate.
  setLayoutInspectorNode(inspector);
  return { finishSlideOut: settle };
}

/** A macrotask tick, which drains every pending microtask chain. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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
  const installed = installFakeViewTransitions();
  transitions = installed.transitions;
  uninstallViewTransitions = installed.uninstall;
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
  // The motionless teardown, so nothing is left waiting on a transition this
  // suite never settles and no teardown survives into the next test.
  abandonLayoutEditorSession();
  deregisterTile?.();
  deregisterTile = null;
  setLayoutInspectorNode(null);
  uninstallViewTransitions();
  transitions.length = 0;
  document.documentElement.removeAttribute("data-reduce-panel-motion");
  document.documentElement.removeAttribute("data-layout-transition");
  document.body.replaceChildren();
  useTabsStore.setState({ ...emptyTabStripLayout(), stripOrder: [] });
  // `Analytics.getInstance()` is a module-level singleton, so a
  // `vi.spyOn(..., "track")` left standing would keep accumulating calls
  // across every later test in this file.
  vi.restoreAllMocks();
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

  it("turns on 1100px exactly, and on no other number (L-64)", () => {
    // The number is the point. A gate asserted only at 700px passes just as
    // well on the 768px mobile breakpoint three surfaces used to read for
    // this, which is the bug L-64 settles: the editor opened into a 900px
    // window with no room for either half of itself.
    expect(LAYOUT_EDITOR_MIN_WIDTH).toBe(1100);

    setViewportWidth(LAYOUT_EDITOR_MIN_WIDTH - 1);
    expect(open(null)).toBe(false);
    expect(useLayoutEditorStore.getState().session).toBeNull();

    setViewportWidth(LAYOUT_EDITOR_MIN_WIDTH);
    expect(open(null)).toBe(true);
    expect(useLayoutEditorStore.getState().session).not.toBeNull();
  });

  it("holds a live session open at the threshold and drops it one pixel below", () => {
    seedOpenChat("tile-7");
    open(null);

    setViewportWidth(LAYOUT_EDITOR_MIN_WIDTH);
    window.dispatchEvent(new Event("resize"));
    expect(useLayoutEditorStore.getState().session).not.toBeNull();

    setViewportWidth(LAYOUT_EDITOR_MIN_WIDTH - 1);
    window.dispatchEvent(new Event("resize"));
    expect(useLayoutEditorStore.getState().leaving).toBe(true);

    drainTransitions();
    expect(useLayoutEditorStore.getState().session).toBeNull();
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

  it("takes the sample workspace when a native browser tile is on screen (C-18)", () => {
    // The chat is there and would be the canvas on its own. A `<webview>`
    // guest paints outside the page, so it neither dims with the rest of the
    // app nor travels with a shell snapshot, and the editor would be decorating
    // a chat with an undimmed hole in it.
    seedOpenChat("tile-7");
    presentNativeTile();

    expect(open(null)).toBe(true);

    const session = useLayoutEditorStore.getState().session;
    expect(session?.scene).toBe("sample");
    expect(session?.preferredInstanceId).toBeNull();
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

    // Still held while the editor is still on screen and still writing: the
    // key goes back with the teardown, not 220ms before it (G2-03).
    expect(window.localStorage.getItem(LAYOUT_EDITOR_LEASE_KEY)).not.toBeNull();

    drainTransitions();

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

    close("discard");

    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();

    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    close("done");

    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
  });

  it("closes the sample tab it opened, but not one the user navigated away from", () => {
    open(null);
    expect(sampleTabPresent()).toBe(true);

    close("done");

    expect(sampleTabPresent()).toBe(false);

    open(null);
    expect(sampleTabPresent()).toBe(true);

    close("tab-switch");

    expect(sampleTabPresent()).toBe(true);
  });

  it("is a no-op with no session open", () => {
    closeLayoutEditor("done");
    expect(useLayoutEditorStore.getState().session).toBeNull();
  });
});

describe("the entry method (L-30, L-54)", () => {
  it("records the gesture that reached the door on the session", () => {
    seedOpenChat("tile-7");

    open(null);
    expect(useLayoutEditorStore.getState().session?.entry).toBe("pointer");

    close("done");
    // Keyboard entry is one of L-30's guards, so this one lands in the frame
    // it is made in whether or not the API is there.
    openLayoutEditor({
      source: "command_palette",
      entry: "keyboard",
      target: null,
      navigate,
    });

    expect(useLayoutEditorStore.getState().session?.entry).toBe("keyboard");
  });
});

describe("the guarded fallback exit (5.2)", () => {
  // The inspector's own slide-out exists only on the fallback branch, so these
  // three turn the app's Panel animations switch off rather than pretending
  // the browser has no View Transition API.
  beforeEach(forceReducedMotion);

  it("keeps the session open until the inspector has slid out", async () => {
    seedOpenChat("tile-7");
    open("minimap");
    const slideOut = mountAnimatedInspector();

    closeLayoutEditor("done");

    // Still rendering the section the user was in: an inspector torn down
    // first would slide out as the empty index, which is the flash ticket 07
    // deferred rather than shipped.
    const state = useLayoutEditorStore.getState();
    expect(state.session).not.toBeNull();
    expect(state.selected).toBe("minimap");
    expect(state.leaving).toBe(true);

    slideOut.finishSlideOut();
    await tick();

    expect(useLayoutEditorStore.getState().session).toBeNull();
    expect(useLayoutEditorStore.getState().selected).toBeNull();
  });

  it("lets the first reason stand when a second arrives mid-exit", async () => {
    seedOpenChat("tile-7");
    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    const slideOut = mountAnimatedInspector();

    closeLayoutEditor("done");
    closeLayoutEditor("discard");
    slideOut.finishSlideOut();
    await tick();

    expect(useLayoutEditorStore.getState().session).toBeNull();
    // `done` keeps what the session wrote; the `discard` that arrived while it
    // was leaving did not quietly revert the user's changes.
    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
  });

  it("hands the editor over to a session opened while it was still sliding out", async () => {
    seedOpenChat("tile-7");
    open(null);
    const slideOut = mountAnimatedInspector();
    closeLayoutEditor("done");

    expect(open("minimap")).toBe(true);
    const reopened = useLayoutEditorStore.getState().session;
    slideOut.finishSlideOut();
    await tick();

    // The old session was torn down by the re-open itself, so the slide-out
    // landing afterwards has nothing left to do.
    expect(useLayoutEditorStore.getState().session).toBe(reopened);
    expect(useLayoutEditorStore.getState().selected).toBe("minimap");
  });
});

describe("re-opening during a view-transition exit (5.2, G2-02)", () => {
  it("tears the old session down before the new one is decided", () => {
    // The sample scene, because the sample workspace is the thing the old
    // teardown would take away: it closes the tab by ref, and the re-open has
    // just activated a tab under that same ref.
    open(null);
    const first = useLayoutEditorStore.getState().session;
    expect(first?.scene).toBe("sample");
    expect(sampleTabPresent()).toBe(true);

    // Done, then "actually, not yet" inside the exit's own 220ms. Neither
    // callback has run: on this branch both applies are deferred.
    closeLayoutEditor("done");
    expect(
      openLayoutEditor({
        source: "direct_ui",
        entry: "pointer",
        target: null,
        navigate,
      }),
    ).toBe(true);

    // The browser skips the first transition, so the exit's update callback
    // runs BEFORE the entry's. An exit teardown still in flight here would
    // close the tab the re-open just activated and leave the new session on a
    // sample scene with no sample tab.
    drainTransitions();

    const second = useLayoutEditorStore.getState().session;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(second?.scene).toBe("sample");
    expect(sampleTabPresent()).toBe(true);
    // And the new session holds the key the old one gave back.
    expect(window.localStorage.getItem(LAYOUT_EDITOR_LEASE_KEY)).not.toBeNull();
  });
});

describe("layout_editor_session analytics (L-46, L-54)", () => {
  it("fires once at exit with the session's own source, scene and entry", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    seedOpenChat("tile-7");
    open(null);
    expect(trackSpy).not.toHaveBeenCalled();

    close("done");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({
        source: "direct_ui",
        scene: "in_place",
        entry: "pointer",
        discarded: false,
      }),
    );
  });

  it("reports the sample scene under its analytics spelling", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    open(null);

    close("done");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({ scene: "sample_workspace" }),
    );
  });

  it("reports discarded: true only when the exit reason is discard", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    seedOpenChat("tile-7");
    open(null);

    close("discard");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({ discarded: true }),
    );
  });

  it("reports first_change_bucket as null for a session with no change", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    seedOpenChat("tile-7");
    open(null);

    close("done");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({
        first_change_bucket: null,
        changed_count: 0,
        undo_count: 0,
        regions_touched_count: 0,
      }),
    );
  });

  it("counts the value change made this session and the region it touched", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    seedOpenChat("tile-7");
    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });

    close("done");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({
        changed_count: 1,
        regions_touched_count: 1,
        undo_count: 0,
      }),
    );
  });

  it("counts an undo that landed", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    seedOpenChat("tile-7");
    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    useLayoutEditorStore.getState().undo();

    close("done");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({ undo_count: 1, changed_count: 0 }),
    );
  });

  it("reports the entry method passed to the door", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");

    openLayoutEditor({
      source: "command_palette",
      entry: "keyboard",
      target: null,
      navigate,
    });
    drainTransitions();
    close("done");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({ source: "command_palette", entry: "keyboard" }),
    );
  });

  it("counts what was built before a Discard, not the zero left after it", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");
    seedOpenChat("tile-7");
    open(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });

    close("discard");

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutEditorSession,
      expect.objectContaining({
        discarded: true,
        changed_count: 1,
        regions_touched_count: 1,
      }),
    );
    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();
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
    drainTransitions();

    expect(useLayoutEditorStore.getState().session).toBeNull();
  });

  it("exits when the window narrows past the width the editor needs", () => {
    seedOpenChat("tile-7");
    open(null);

    setViewportWidth(700);
    window.dispatchEvent(new Event("resize"));
    drainTransitions();

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
