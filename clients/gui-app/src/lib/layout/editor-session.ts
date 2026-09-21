import type { UseNavigateResult } from "@tanstack/react-router";
import { toast } from "sonner";
import type { AnalyticsSource } from "@/lib/analytics";
import { aNativeTileIsPresented } from "@/lib/browser-view/tiles/tile-rect-registry";
import { runLayoutEditorMotion } from "@/lib/layout/editor-motion";
import { layoutEditorFitsWindow } from "@/lib/layout/editor-width";
import {
  acquireLayoutEditorLease,
  releaseLayoutEditorLease,
  startLayoutEditorHeartbeat,
} from "@/lib/layout/editor-lease";
import type { RegionId } from "@/lib/layout/region-id";
import { navigateToSettingsSection } from "@/lib/settings-navigation";
import { activateTabIntent } from "@/lib/tab-navigation";
import { useEpicCanvasStore } from "@/stores/epics/canvas/store";
import {
  findPaneById,
  resolveActivePaneTab,
} from "@/stores/epics/canvas/tile-tree";
import {
  useLayoutEditorStore,
  type LayoutEditorEntryMethod,
  type LayoutEditorScene,
  type LayoutEditorSession,
} from "@/stores/layout/layout-editor-store";
import { createLayoutItem, flattenLayoutRefs } from "@/stores/tabs/layout";
import { useTabsStore } from "@/stores/tabs/store";
import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";

/**
 * The one door into and out of the layout editor (L-15, 5.1, 5.3).
 *
 * Every entry point - the palette, the chrome's context menus, the Appearance
 * card, a Settings search result - lands here, because the scene, the lease,
 * the width gate and the teardown are session facts and not properties of
 * whichever gesture reached them. The entry points themselves are ticket 10;
 * what this module owns is what happens once one of them fires.
 */

type NavigateFn = UseNavigateResult<string>;

const SAMPLE_WORKSPACE_REF = {
  kind: "sample-workspace",
  id: "sample-workspace",
} as const;

/** Why a session ended, which is what decides the teardown (5.3). */
export type LayoutEditorExitReason =
  | "done"
  | "escape"
  | "discard"
  | "tab-switch"
  | "sample-closed"
  | "below-threshold"
  | "lease-lost";

export interface OpenLayoutEditorInput {
  /**
   * The gesture that reached the door. Carried on `layout_editor_session` at
   * exit, which the analytics ticket adds; the door takes it now so that every
   * entry point names its gesture at the one place the session begins.
   */
  readonly source: AnalyticsSource;
  /**
   * Whether a pointer or the keyboard reached the door (L-30, L-54). It gates
   * the entry and exit motion and is carried on `layout_editor_session` at
   * exit, so every entry point names its own gesture rather than the session
   * guessing from what happens to be focused.
   */
  readonly entry: LayoutEditorEntryMethod;
  /** The region to preselect, for a deep link out of Settings search (5.3). */
  readonly target: RegionId | null;
  /**
   * The router's navigate, needed only for the sample-workspace fallback
   * scene: the sample is a real top-level tab, so it is opened through the
   * ordinary tab navigation controller rather than by writing the tab store.
   */
  readonly navigate: NavigateFn;
}

/**
 * Enter the editor, or send the user to the full-width form instead.
 *
 * Returns whether a session is now opening. `false` means the width gate
 * (L-02) redirected to `Settings > Layout`, or another window holds the lease
 * (L-32). On the view-transition path the session itself begins a frame later,
 * inside the transition's update callback, which is why everything the session
 * owns - the store record, the watchers, the heartbeat - lands there together
 * rather than half here and half in a callback.
 */
export function openLayoutEditor(input: OpenLayoutEditorInput): boolean {
  const editor = useLayoutEditorStore.getState();
  // A session that is on its way out is not one to hand back: the user who
  // asked again during the slide-out asked for a new session, and the exit
  // already in flight yields to it (see `endSession`).
  if (editor.session !== null && !editor.leaving) return true;
  // The width gate (L-02, L-64), owned by `editor-width.ts`: below it the app
  // cannot reflow beside a 320px instrument panel, so the form takes the whole
  // page instead of the editor opening into a canvas with no room.
  if (!layoutEditorFitsWindow()) {
    navigateToSettingsSection("layout");
    return false;
  }
  if (!acquireLayoutEditorLease()) return false;

  // A presented browser tile is painted outside the page, so it neither dims
  // with the canvas nor travels with a shell snapshot: the editor takes the
  // sample workspace instead of the tile's own chat (C-18, 4.2).
  const preferredInstanceId = aNativeTileIsPresented()
    ? null
    : preferredChatTileId();
  const scene: LayoutEditorScene =
    preferredInstanceId === null ? "sample" : "in-place";
  // Before the session begins, so the activation this performs is not the tab
  // switch the session watcher exits on.
  if (scene === "sample") openSampleWorkspace(input.navigate);

  runLayoutEditorMotion({
    phase: "enter",
    entry: input.entry,
    dockMode: editor.dockMode,
    apply: () => {
      useLayoutEditorStore.getState().beginSession({
        scene,
        entry: input.entry,
        preferredInstanceId,
        startedAt: Date.now(),
      });
      if (input.target !== null) {
        useLayoutEditorStore.getState().select(input.target);
      }
      watchSession(scene);
      startLayoutEditorHeartbeat(() => {
        closeLayoutEditor("lease-lost");
      });
    },
  });
  return true;
}

/**
 * Leave the editor. `discard` puts the entry snapshot back first (L-18); every
 * other reason keeps what the session wrote, because changes applied live.
 *
 * The teardown is the last thing to happen, not the first: on the fallback
 * path the inspector slides out while it is still rendering the session, so
 * `leaving` marks the window in which the editor is open and already going.
 */
export function closeLayoutEditor(reason: LayoutEditorExitReason): void {
  const editor = useLayoutEditorStore.getState();
  const session = editor.session;
  if (session === null || editor.leaving) return;
  useLayoutEditorStore.setState({ leaving: true });
  // Synchronous whatever the exit animates: an editor on its way out must stop
  // watching for reasons to leave, and must not go on renewing a lease it has
  // given up.
  stopWatchingSession();
  releaseLayoutEditorLease();
  runLayoutEditorMotion({
    phase: "exit",
    entry: session.entry,
    dockMode: editor.dockMode,
    apply: () => {
      endSession(session, reason);
    },
  });
  if (reason === "lease-lost") {
    toast.info(
      "Customize layout moved to another window. Your layout is saved.",
    );
  }
}

/** The teardown itself, once whatever carries the exit has played. */
function endSession(
  session: LayoutEditorSession,
  reason: LayoutEditorExitReason,
): void {
  const editor = useLayoutEditorStore.getState();
  // A session opened while this one was sliding out owns the editor now, and
  // tearing it down here would close an editor the user just asked for.
  if (editor.session !== session) return;
  if (reason === "discard") editor.discard();
  editor.endSession();
  // A sample tab that is already gone, or that the user navigated away from,
  // is not this editor's to close: the first case has nothing to close and the
  // second would take away a tab the user just chose.
  if (
    session.scene === "sample" &&
    reason !== "tab-switch" &&
    reason !== "sample-closed" &&
    reason !== "lease-lost"
  ) {
    tabCommandCoordinator.closeRefAfterConfirmed({ ...SAMPLE_WORKSPACE_REF });
  }
}

/**
 * The tile whose copy of a region wins when several are on screen (L-23,
 * C-25), and the scene decision with it: a real chat in the active pane is the
 * canvas, and the sample workspace is only the automatic fallback when there
 * is none (L-15).
 */
function preferredChatTileId(): string | null {
  const state = useEpicCanvasStore.getState();
  if (state.activeTabId === null) return null;
  const canvas = state.canvasByTabId[state.activeTabId];
  if (canvas === undefined) return null;
  const pane =
    canvas.activePaneId === null
      ? null
      : findPaneById(canvas.root, canvas.activePaneId);
  if (pane === null) return null;
  return resolveActivePaneTab(pane.activeTabId, pane.tabInstanceIds);
}

/**
 * Open the sample workspace as a real tab, remembering what the user was
 * looking at so closing it puts them back (`sampleReturnItemId`, read by
 * `withoutSampleWorkspace`).
 */
function openSampleWorkspace(navigate: NavigateFn): void {
  useTabsStore.setState((state) => {
    const layout = createLayoutItem(state, { ...SAMPLE_WORKSPACE_REF });
    const items = layout.items.map((item) => {
      if (
        item.kind !== "tab" ||
        item.ref.kind !== "sample-workspace" ||
        state.items.some((existing) => existing.id === item.id)
      )
        return item;
      return { ...item, sampleReturnItemId: state.activeItemId };
    });
    return { items, stripOrder: flattenLayoutRefs(layout) };
  });
  activateTabIntent(navigate, { kind: "sample-workspace" }, undefined);
}

let stopSessionWatch: (() => void) | null = null;

/**
 * Everything that ends a session without the user asking (5.3).
 *
 * The editor never auto-exits on something the app merely SAYS (L-17) - only
 * on the canvas going away underneath it: another tab taking over, the sample
 * scene closing, the window narrowing past the width the editor needs.
 */
function watchSession(scene: LayoutEditorScene): void {
  stopWatchingSession();
  const activeItemId = useTabsStore.getState().activeItemId;
  const unwatchTabs = useTabsStore.subscribe((state) => {
    if (
      scene === "sample" &&
      !state.items.some(
        (item) => item.kind === "tab" && item.ref.kind === "sample-workspace",
      )
    ) {
      closeLayoutEditor("sample-closed");
      return;
    }
    if (state.activeItemId !== activeItemId) closeLayoutEditor("tab-switch");
  });
  // The preferred tile is re-read rather than frozen: a tile can close under
  // the editor, and the ring and the chip have to follow the instance that is
  // still on screen.
  const unwatchCanvas = useEpicCanvasStore.subscribe(() => {
    const state = useLayoutEditorStore.getState();
    const session = state.session;
    if (session === null || session.scene !== "in-place") return;
    const preferredInstanceId = preferredChatTileId();
    if (preferredInstanceId === session.preferredInstanceId) return;
    useLayoutEditorStore.setState({
      session: { ...session, preferredInstanceId },
    });
  });
  const onResize = (): void => {
    if (!layoutEditorFitsWindow()) closeLayoutEditor("below-threshold");
  };
  window.addEventListener("resize", onResize);
  stopSessionWatch = () => {
    unwatchTabs();
    unwatchCanvas();
    window.removeEventListener("resize", onResize);
  };
}

function stopWatchingSession(): void {
  stopSessionWatch?.();
  stopSessionWatch = null;
}
