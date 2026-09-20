import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  EMPTY_LAYOUT_HISTORY,
  rebaseLayoutSnapshot,
  recordLayoutChange,
  redoLayout,
  undoLayout,
  type LayoutHistory,
} from "@/lib/layout/layout-history";
import type { RegionId } from "@/lib/layout/region-id";
import { basePersistOptions, persistKey, STORE_KEYS } from "@/lib/persist";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import {
  getLayoutSnapshot,
  useLayoutStore,
  type LayoutSnapshot,
} from "@/stores/layout/layout-store";

/**
 * Everything that is true only while the editor is open, and nothing else
 * (L-01, L-21).
 *
 * The split from `layout-store.ts` is the load-bearing part: this store holds
 * NO layout values. A gesture mutates the layout store and lands one snapshot
 * on the stacks here, which is what makes Undo, Redo and Discard exact whatever
 * a gesture touched, and what lets a write from another window arrive without
 * this store having an opinion about it.
 *
 * One field is persisted - the dock mode, which is a preference about the
 * instrument panel rather than about a session (L-38).
 */

/** Whether the editor is decorating the user's own chat or the sample workspace (L-15). */
export type LayoutEditorScene = "in-place" | "sample";

/** Where the inspector sits (L-38). `float` is the one mode allowed to overlap. */
export type LayoutDockMode = "right" | "left" | "float";

export interface LayoutEditorSession {
  readonly scene: LayoutEditorScene;
  /**
   * The chat tile whose instance of a region wins when several are on screen
   * (L-23): it carries the anchor and the travelling ring, the others get a
   * static outline.
   */
  readonly preferredInstanceId: string | null;
  readonly startedAt: number;
}

export type RegionInstanceKey = string;

/**
 * One live region node on the canvas. Registered by `useLayoutRegion`, which
 * also stamps the data attributes the decoration CSS reads (4.1, 4.2); this
 * record is what the ring and the chip measure and anchor to.
 */
export interface RegionInstance {
  readonly key: RegionInstanceKey;
  readonly regionId: RegionId;
  readonly sceneId: string;
  readonly instanceId: string | null;
  readonly node: HTMLElement;
}

/** The one level below a region section: a provider's own limits (L-26). */
export interface InspectorLevel {
  readonly kind: "usage-provider";
  readonly providerId: RateLimitProviderId;
}

/** Whether another window holds the single-window lease (L-32). */
export type LayoutEditorLock = "none" | "other-window";

export interface LayoutEditorState {
  readonly session: LayoutEditorSession | null;
  readonly instances: ReadonlyMap<RegionInstanceKey, RegionInstance>;
  readonly selected: RegionId | null;
  readonly level: InspectorLevel | null;
  readonly hovered: RegionId | null;
  /**
   * Raised by the first key press and dropped by the first pointer gesture: a
   * row taking focus only drives the canvas highlight when the focus came from
   * the keyboard, so clicking around the inspector leaves the canvas quiet.
   */
  readonly keyboardNav: boolean;
  readonly filter: string;
  readonly dockMode: LayoutDockMode;
  readonly history: LayoutHistory;
  /** The state Discard restores, rebased on every external write (L-18). */
  readonly entrySnapshot: LayoutSnapshot | null;
  /** Whether something in the app is waiting for the user (L-17, 4.8). */
  readonly relayRaised: boolean;
  readonly lockedBy: LayoutEditorLock;

  readonly beginSession: (session: LayoutEditorSession) => void;
  readonly endSession: () => void;
  readonly registerInstance: (instance: RegionInstance) => void;
  readonly unregisterInstance: (
    key: RegionInstanceKey,
    node: HTMLElement,
  ) => void;
  readonly select: (regionId: RegionId | null) => void;
  readonly openLevel: (level: InspectorLevel) => void;
  /**
   * One rung of the Escape ladder (L-31, C-26): the provider level, then the
   * open section, then the index. `false` means the ladder is already at the
   * index and the caller exits the editor.
   */
  readonly popInspectorLevel: () => boolean;
  readonly setHovered: (regionId: RegionId | null) => void;
  readonly setKeyboardNav: (keyboardNav: boolean) => void;
  readonly setFilter: (filter: string) => void;
  readonly setDockMode: (dockMode: LayoutDockMode) => void;
  readonly setRelayRaised: (relayRaised: boolean) => void;
  readonly setLockedBy: (lockedBy: LayoutEditorLock) => void;
  /** One gesture: whatever `mutate` writes to the layout store is one undo step. */
  readonly recordGesture: (mutate: () => void) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly discard: () => void;
}

const SESSION_DEFAULTS = {
  session: null,
  instances: new Map<RegionInstanceKey, RegionInstance>(),
  selected: null,
  level: null,
  hovered: null,
  keyboardNav: false,
  filter: "",
  history: EMPTY_LAYOUT_HISTORY,
  entrySnapshot: null,
  relayRaised: false,
} as const;

export const useLayoutEditorStore = create<LayoutEditorState>()(
  persist(
    (set, get) => ({
      ...SESSION_DEFAULTS,
      dockMode: "right",
      lockedBy: "none",
      beginSession: (session) => {
        set({
          ...SESSION_DEFAULTS,
          // The nodes on screen belong to the app, not to the session: a
          // region that registered before the session opened stays registered.
          instances: get().instances,
          session,
          entrySnapshot: getLayoutSnapshot(),
        });
        watchExternalLayoutWrites();
      },
      endSession: () => {
        stopWatchingLayoutWrites();
        set({ ...SESSION_DEFAULTS, instances: get().instances });
      },
      registerInstance: (instance) =>
        set((state) => {
          if (state.instances.get(instance.key) === instance) return state;
          const instances = new Map(state.instances);
          instances.set(instance.key, instance);
          return { instances };
        }),
      unregisterInstance: (key, node) =>
        set((state) => {
          // Node-checked, so a remount that registers before the old copy
          // tears down does not delete the live entry.
          if (state.instances.get(key)?.node !== node) return state;
          const instances = new Map(state.instances);
          instances.delete(key);
          return { instances };
        }),
      select: (selected) => set({ selected, level: null }),
      openLevel: (level) => set({ level }),
      popInspectorLevel: () => {
        const state = get();
        if (state.level !== null) {
          set({ level: null });
          return true;
        }
        if (state.selected !== null) {
          set({ selected: null });
          return true;
        }
        return false;
      },
      setHovered: (hovered) => set({ hovered }),
      setKeyboardNav: (keyboardNav) => set({ keyboardNav }),
      setFilter: (filter) => set({ filter }),
      setDockMode: (dockMode) => set({ dockMode }),
      setRelayRaised: (relayRaised) => set({ relayRaised }),
      setLockedBy: (lockedBy) => set({ lockedBy }),
      recordGesture: (mutate) => {
        const before = getLayoutSnapshot();
        applyAsEditorWrite(mutate);
        // A gesture that landed on the value it already had is not a step: an
        // Undo that visibly does nothing is worse than no Undo.
        if (sameSnapshot(before, getLayoutSnapshot())) return;
        set({ history: recordLayoutChange(get().history, before) });
      },
      undo: () => {
        const travel = undoLayout(get().history, getLayoutSnapshot());
        if (travel === null) return;
        applyAsEditorWrite(() => {
          useLayoutStore.getState().replaceAll(travel.snapshot);
        });
        set({ history: travel.history });
      },
      redo: () => {
        const travel = redoLayout(get().history, getLayoutSnapshot());
        if (travel === null) return;
        applyAsEditorWrite(() => {
          useLayoutStore.getState().replaceAll(travel.snapshot);
        });
        set({ history: travel.history });
      },
      discard: () => {
        const entrySnapshot = get().entrySnapshot;
        if (entrySnapshot === null) return;
        applyAsEditorWrite(() => {
          useLayoutStore.getState().replaceAll(entrySnapshot);
        });
        set({ history: EMPTY_LAYOUT_HISTORY });
      },
    }),
    {
      ...basePersistOptions(persistKey(STORE_KEYS.layoutEditorDock)),
      storage: createJSONStorage(() => localStorage),
      // The dock is a preference about the instrument panel; everything else
      // in this store describes one session and dies with it.
      partialize: (state) => ({ dockMode: state.dockMode }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        dockMode: persistedDockMode(persistedState),
      }),
    },
  ),
);

/**
 * The instance the overlays point at: the preferred tile's, or the first one
 * registered when that tile has no node for this region (4.6, C-25).
 */
export function preferredRegionInstance(
  state: Pick<LayoutEditorState, "instances" | "session">,
  regionId: RegionId,
): RegionInstance | null {
  const preferredInstanceId = state.session?.preferredInstanceId ?? null;
  let first: RegionInstance | null = null;
  for (const instance of state.instances.values()) {
    if (instance.regionId !== regionId) continue;
    if (
      preferredInstanceId !== null &&
      instance.instanceId === preferredInstanceId
    )
      return instance;
    first = first ?? instance;
  }
  return first;
}

/**
 * Whether the editor is asking for this region to be on screen right now even
 * though the user hid it (L-14).
 *
 * There are no ghosts at rest: a hidden region materialises in place only
 * while its index row is hovered or selected, and vanishes again the moment
 * the pointer leaves. Whether it is actually hidden is the caller's question -
 * this one only says whether the editor is pointing at it.
 */
export function regionGhostRequested(
  state: Pick<LayoutEditorState, "session" | "hovered" | "selected">,
  regionId: RegionId,
): boolean {
  if (state.session === null) return false;
  return state.hovered === regionId || state.selected === regionId;
}

/** Every live node for one region, in registration order (L-23). */
export function regionInstances(
  state: Pick<LayoutEditorState, "instances">,
  regionId: RegionId,
): ReadonlyArray<RegionInstance> {
  return [...state.instances.values()].filter(
    (instance) => instance.regionId === regionId,
  );
}

/**
 * Writes the editor made itself, so the external-write watcher can tell them
 * apart from a write by another window or by a settings surface (L-18).
 */
let editorWriteDepth = 0;

function applyAsEditorWrite(mutate: () => void): void {
  editorWriteDepth += 1;
  try {
    mutate();
  } finally {
    editorWriteDepth -= 1;
  }
}

let stopLayoutWatch: (() => void) | null = null;

function watchExternalLayoutWrites(): void {
  stopWatchingLayoutWrites();
  let previous = getLayoutSnapshot();
  stopLayoutWatch = useLayoutStore.subscribe(() => {
    const before = previous;
    const next = getLayoutSnapshot();
    previous = next;
    if (editorWriteDepth > 0) return;
    const entrySnapshot = useLayoutEditorStore.getState().entrySnapshot;
    if (entrySnapshot === null) return;
    // History is deliberately left alone: the old editor wiped the stacks on
    // any external write, which lost the user's own work to someone else's.
    useLayoutEditorStore.setState({
      entrySnapshot: rebaseLayoutSnapshot(entrySnapshot, before, next),
    });
  });
}

function stopWatchingLayoutWrites(): void {
  stopLayoutWatch?.();
  stopLayoutWatch = null;
}

/**
 * Compared as JSON, the same way `rebaseLayoutSnapshot` compares a field: both
 * sides are plain data built by the same resolvers, so key order is not a
 * variable.
 */
function sameSnapshot(left: LayoutSnapshot, right: LayoutSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function persistedDockMode(persistedState: unknown): LayoutDockMode {
  if (persistedState === null || typeof persistedState !== "object")
    return "right";
  const dockMode: unknown = Reflect.get(persistedState, "dockMode");
  return dockMode === "left" || dockMode === "float" || dockMode === "right"
    ? dockMode
    : "right";
}
