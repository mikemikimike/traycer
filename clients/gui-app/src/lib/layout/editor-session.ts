import type { UseNavigateResult } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import {
  Analytics,
  AnalyticsEvent,
  type AnalyticsSource,
} from "@/lib/analytics";
import { runLayoutEditorMotion } from "@/lib/layout/editor-motion";
import {
  layoutEditorFitsWindow,
  subscribeLayoutEditorFitsWindow,
} from "@/lib/layout/editor-width";
import {
  acquireLayoutEditorLease,
  releaseLayoutEditorLease,
  startLayoutEditorHeartbeat,
} from "@/lib/layout/editor-lease";
import {
  layoutDurationBucket,
  layoutEditorSessionChangeSummary,
} from "@/lib/layout/layout-diff";
import type { RegionId } from "@/lib/layout/region-id";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import {
  closeSystemOverlay,
  navigateToLayoutRegion,
  navigateToSettingsSection,
} from "@/lib/settings-navigation";
import { activateTabIntent } from "@/lib/tab-navigation";
import { useCommandPaletteStore } from "@/stores/command-palette/command-palette-store";
import {
  useLayoutEditorStore,
  type LayoutEditorEntryMethod,
  type LayoutEditorSession,
} from "@/stores/layout/layout-editor-store";
import { getLayoutSnapshot } from "@/stores/layout/layout-store";
import { createLayoutItem, flattenLayoutRefs } from "@/stores/tabs/layout";
import { useTabsStore } from "@/stores/tabs/store";
import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";

/**
 * The one door into and out of the layout editor (L-87, 5.1, 5.3).
 *
 * Every entry point - the palette, the chrome's context menus, the Appearance
 * card, a Settings search result - lands here, because the canvas, the lease,
 * the width gate and the teardown are session facts and not properties of
 * whichever gesture reached them. The entry points themselves are ticket 10;
 * what this module owns is what happens once one of them fires.
 *
 * The canvas is ALWAYS the sample workspace (L-87, superseding L-15): a user
 * who asks to customize the layout is not asking to have their own task
 * rearranged under them. The sample tab and the session therefore have one
 * lifetime - the door opens the tab before the session begins, closing the tab
 * ends the session, and ending the session closes the tab - which is the one
 * invariant behind the width gate here, the watcher below and
 * `SampleSceneProvider`'s own close.
 *
 * It is also why nothing here says which INSTANCE of a region the overlays
 * follow. The sample tab is activated before the session begins, it is
 * `splitEligibility: "ineligible"` so nothing is ever presented beside it, and
 * `useLayoutRegion` registers nothing from a surface whose
 * `PaneVisibilityContext` is false - which every other top-level surface's is
 * while the sample tab is the active one. One visible scene, one instance per
 * region, nothing to choose between.
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
   * The router's navigate: the sample workspace is a real top-level tab, so it
   * is opened through the ordinary tab navigation controller rather than by
   * writing the tab store.
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
  // asked again during the slide-out asked for a new session.
  if (editor.session !== null && !editor.leaving) {
    // Asked again from inside a session, which since L-129 is an ordinary
    // gesture rather than a stray press: the quick-verb menu works in a
    // session too, and its "Customize layout..." names a region. There is no
    // second door to open, so what is left of the request is the half that
    // still means something - land on that region (L-19).
    if (input.target !== null) editor.select(input.target);
    return true;
  }
  // And that session goes NOW rather than whenever its exit motion lands. On
  // the view-transition path both applies are deferred and the exit's runs
  // first, so a teardown left in flight would end the session this call is
  // about to begin and close the sample tab it just activated.
  flushPendingTeardown();
  // The width gate (L-02, L-64), owned by `editor-width.ts`: below it the app
  // cannot reflow beside a 320px instrument panel, so the form takes the whole
  // page instead of the editor opening into a canvas with no room.
  if (!layoutEditorFitsWindow()) {
    // A press that does nothing is worse than one that explains itself: the
    // redirect has nowhere to go before the modal bridge publishes an API
    // (a cold launch behind `HostReadyGate`), and the user would otherwise be
    // left pressing a row with no window wide enough and no page to land on.
    //
    // The target goes WITH it. The page has a row per region now (L-95), so
    // the region a search result or a quick verb named is something the
    // redirect can land on rather than discard (A.5 gap 1).
    const reached =
      input.target === null
        ? navigateToSettingsSection("layout")
        : navigateToLayoutRegion(input.target);
    if (!reached) toast.info("Customize layout needs a wider window.");
    return false;
  }
  if (!acquireLayoutEditorLease()) return false;
  // The app's own system overlay is chrome the editor is about to decorate,
  // and it is portalled above everything the editor draws (L-91). Dismissing
  // it belongs to the door for the same reason the lease and the width gate
  // do: a call site that forgets is a call site that reopens the bug.
  closeSystemOverlay();
  dismissCommandPalette();
  // Before the session begins, so the activation this performs is not the tab
  // switch the session watcher exits on.
  openSampleWorkspace(input.navigate);

  runLayoutEditorMotion({
    phase: "enter",
    entry: input.entry,
    dockMode: editor.dockMode,
    apply: () => {
      useLayoutEditorStore.getState().beginSession({
        entry: input.entry,
        source: input.source,
        startedAt: Date.now(),
      });
      if (input.target !== null) {
        useLayoutEditorStore.getState().select(input.target);
      }
      watchSession();
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
  pendingTeardown = () => {
    endSession(session, reason);
  };
  runLayoutEditorMotion({
    phase: "exit",
    entry: session.entry,
    dockMode: editor.dockMode,
    apply: flushPendingTeardown,
  });
  if (reason === "lease-lost") {
    toast.info(
      "Customize layout moved to another window. Your layout is saved.",
    );
  }
}

/**
 * The teardown of a session that is leaving and whose exit motion has not
 * landed yet.
 *
 * One slot, because one session leaves at a time: `closeLayoutEditor` refuses
 * a second reason while `leaving` is up. It exists so the teardown has an owner
 * other than the motion callback - `openLayoutEditor` runs it early, and the
 * shell's unmount runs it with no motion at all.
 */
let pendingTeardown: (() => void) | null = null;

function flushPendingTeardown(): void {
  const teardown = pendingTeardown;
  pendingTeardown = null;
  teardown?.();
}

/**
 * The shell itself is going away (a sign-out, a window closing), so there is no
 * document left to glide and no inspector left to slide out: whatever is open
 * ends here and now.
 */
export function abandonLayoutEditorSession(): void {
  const editor = useLayoutEditorStore.getState();
  if (editor.session === null) return;
  if (editor.leaving) {
    flushPendingTeardown();
    return;
  }
  endSession(editor.session, "done");
}

/** The teardown itself, once whatever carries the exit has played. */
function endSession(
  session: LayoutEditorSession,
  reason: LayoutEditorExitReason,
): void {
  // Here rather than at the top of `closeLayoutEditor`: until this runs the
  // editor is still rendered and still writing, and a lease given up 140ms to
  // 220ms early lets a second window take the key out from under a live editor.
  stopWatchingSession();
  releaseLayoutEditorLease();
  const editor = useLayoutEditorStore.getState();
  // Read before `discard()` puts the entry snapshot back: what the session
  // built up before it was thrown away is the signal, not the zero a
  // post-discard read would always report.
  trackLayoutEditorSession({
    session,
    discarded: reason === "discard",
    entrySnapshot: editor.entrySnapshot ?? getLayoutSnapshot(),
    exitSnapshot: getLayoutSnapshot(),
    undoCount: editor.undoCount,
    firstChangeAt: editor.firstChangeAt,
    now: Date.now(),
  });
  if (reason === "discard") editor.discard();
  editor.endSession();
  // A sample tab that is already gone, or that the user navigated away from,
  // is not this editor's to close: the first case has nothing to close and the
  // second would take away a tab the user just chose.
  if (
    reason !== "tab-switch" &&
    reason !== "sample-closed" &&
    reason !== "lease-lost"
  ) {
    tabCommandCoordinator.closeRefAfterConfirmed({ ...SAMPLE_WORKSPACE_REF });
  }
}

/**
 * Put the command palette away BEFORE anything navigates (L-134).
 *
 * The palette dismisses itself after the item it ran - `runCommandItem` closes
 * it in a `finally`, and because `run` is awaited that lands a microtask later
 * still, interleaved with the router's own promise chain. What this item does
 * is activate a tab, and the activation did not survive that: opening the
 * editor from the palette docked the inspector over the tab the user came
 * from, with the sample workspace sitting beside it as a retained background
 * tab and nothing registering from it (LV2-06).
 *
 * So the door dismisses it, for the same reason it dismisses the system
 * overlays above: which layers have to be down before the app navigates is a
 * fact about the door, not about whichever gesture reached it - and a call
 * site that forgets is a call site that reopens the bug.
 *
 * The flush is the load-bearing half. A store write alone leaves the dialog
 * mounted, and its unmount - with Radix's focus restore inside it - would land
 * on React's next commit, which is after the navigation this returns to. The
 * guard keeps it to the one entry point that has a palette open: every other
 * door does no React work here at all.
 */
function dismissCommandPalette(): void {
  if (!useCommandPaletteStore.getState().open) return;
  flushSync(() => {
    useCommandPaletteStore.getState().setOpen(false);
  });
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
      // A capture pointing at the sample tab itself is a tab that returns to
      // itself, which `removeLayoutRef` would resolve to a tab it has just
      // removed. `null` is the honest answer - it means Home.
      return {
        ...item,
        sampleReturnItemId:
          state.activeItemId === item.id ? null : state.activeItemId,
      };
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
 * tab closing, the window narrowing past the width the editor needs.
 */
function watchSession(): void {
  stopWatchingSession();
  const activeItemId = useTabsStore.getState().activeItemId;
  const unwatchTabs = useTabsStore.subscribe((state) => {
    if (
      !state.items.some(
        (item) => item.kind === "tab" && item.ref.kind === "sample-workspace",
      )
    ) {
      closeLayoutEditor("sample-closed");
      return;
    }
    if (state.activeItemId !== activeItemId) closeLayoutEditor("tab-switch");
  });
  const unwatchWidth = subscribeLayoutEditorFitsWindow(() => {
    if (!layoutEditorFitsWindow()) closeLayoutEditor("below-threshold");
  });
  stopSessionWatch = () => {
    unwatchTabs();
    unwatchWidth();
  };
}

function stopWatchingSession(): void {
  stopSessionWatch?.();
  stopSessionWatch = null;
}

/**
 * `layout_editor_session`, fired once per session at the exit (L-46, L-54,
 * tech-plan section 7). Assembled here, the one place a session's whole
 * record - the gesture that opened it, its entry and exit snapshots, its
 * undo count - is still in hand; `session.entry`/`.source` are carried on the
 * session itself for exactly this call.
 */
function trackLayoutEditorSession(input: {
  readonly session: LayoutEditorSession;
  readonly discarded: boolean;
  readonly entrySnapshot: LayoutSnapshot;
  readonly exitSnapshot: LayoutSnapshot;
  readonly undoCount: number;
  readonly firstChangeAt: number | null;
  readonly now: number;
}): void {
  const {
    session,
    discarded,
    entrySnapshot,
    exitSnapshot,
    undoCount,
    firstChangeAt,
    now,
  } = input;
  const summary = layoutEditorSessionChangeSummary(entrySnapshot, exitSnapshot);
  Analytics.getInstance().track(AnalyticsEvent.LayoutEditorSession, {
    source: session.source,
    entry: session.entry,
    session_duration_bucket: layoutDurationBucket(now - session.startedAt),
    first_change_bucket:
      firstChangeAt === null
        ? null
        : layoutDurationBucket(firstChangeAt - session.startedAt),
    changed_count: summary.changedCount,
    undo_count: undoCount,
    regions_touched_count: summary.regionsTouchedCount,
    discarded,
  });
}
