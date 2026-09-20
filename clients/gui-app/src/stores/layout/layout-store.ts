import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import {
  DEFAULT_ARRANGEMENT,
  normalizeArrangement,
  railFromPanelIdGroups,
  resolvePersistedArrangement,
  statusBarShown,
  type LayoutArrangement,
  type RailEntry,
} from "@/lib/layout/layout-arrangement";
import {
  LAYOUT_PRESET_IDS,
  minimizeOverrides,
  minimizeRegionOverride,
  PRESET_VALUES,
  resolvePersistedOverrides,
  type LayoutOverrides,
  type LayoutPresetId,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import {
  basePersistOptions,
  installCrossWindowRehydrate,
  persistKey,
  STORE_KEYS,
} from "@/lib/persist";

/**
 * The one store the layout editor writes and every chrome surface reads
 * (L-21): a density preset, the minimal delta against it, and where things
 * live.
 *
 * Three fields rather than a slice per surface, because the editor's own
 * gestures are all three at once - a preset applies values and leaves the
 * arrangement alone, Discard restores a whole snapshot, and the header's
 * "Compact + 3 changes" is a count over the delta. Effective values are
 * computed (`effectiveLayoutValues`) rather than stored, so a preset switch
 * keeps every change a user made on top of it.
 */
export interface LayoutSnapshot {
  readonly basePreset: LayoutPresetId;
  readonly overrides: LayoutOverrides;
  readonly arrangement: LayoutArrangement;
}

export interface LayoutStoreState extends LayoutSnapshot {
  /**
   * Whether the one-shot carry of the four shipped values has run (L-49).
   * Persisted in this same blob, which is what makes it one-shot.
   */
  readonly layoutCarryDone: boolean;
  readonly setBasePreset: (preset: LayoutPresetId) => void;
  readonly setRegionValues: <K extends RegionId>(
    region: K,
    patch: Partial<LayoutValues[K]>,
  ) => void;
  readonly setArrangement: (arrangement: LayoutArrangement) => void;
  readonly replaceAll: (next: LayoutSnapshot) => void;
}

export const DEFAULT_LAYOUT_SNAPSHOT: LayoutSnapshot = {
  basePreset: "default",
  overrides: {},
  arrangement: DEFAULT_ARRANGEMENT,
};

const LAYOUT_PERSIST_KEY = persistKey(STORE_KEYS.layout);

/**
 * Bumped for the new shape, with no `migrate`: the layout store is unreleased
 * (L-22), so a blob written by a development build is discarded rather than
 * translated. The four values that DID ship are carried separately, below.
 */
const LAYOUT_PERSIST_VERSION = 2;

carryShippedLayoutValues();

export const useLayoutStore = create<LayoutStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_LAYOUT_SNAPSHOT,
      layoutCarryDone: false,
      setBasePreset: (basePreset) => {
        const state = get();
        if (state.basePreset === basePreset) return;
        // Re-minimized against the NEW base: a change that the new preset
        // happens to already make is no longer a change, and the header would
        // otherwise read "Compact + 1 change" with nothing to revert.
        set({
          basePreset,
          overrides: minimizeOverrides(state.overrides, basePreset),
        });
      },
      setRegionValues: (region, patch) => {
        const state = get();
        const base = PRESET_VALUES[state.basePreset][region];
        const merged = { ...state.overrides[region], ...patch };
        const next = minimizeRegionOverride(merged, base);
        set({
          overrides: minimizeOverrides(
            { ...state.overrides, [region]: next },
            state.basePreset,
          ),
        });
      },
      setArrangement: (arrangement) => {
        set({ arrangement: normalizeArrangement(arrangement) });
      },
      replaceAll: (next) => {
        set({
          basePreset: next.basePreset,
          overrides: minimizeOverrides(next.overrides, next.basePreset),
          arrangement: normalizeArrangement(next.arrangement),
        });
      },
    }),
    {
      ...basePersistOptions(LAYOUT_PERSIST_KEY),
      version: LAYOUT_PERSIST_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Field by field against the defaults, like every resolver in this app:
      // a corrupt arrangement cannot reach the values, and a value union this
      // build no longer has cannot reach a render path.
      merge: (persistedState, currentState) => {
        const persisted: Record<string, unknown> = isRecord(persistedState)
          ? persistedState
          : {};
        const basePreset = isLayoutPresetId(persisted.basePreset)
          ? persisted.basePreset
          : DEFAULT_LAYOUT_SNAPSHOT.basePreset;
        return {
          ...currentState,
          basePreset,
          overrides: resolvePersistedOverrides(persisted.overrides, basePreset),
          arrangement: resolvePersistedArrangement(persisted.arrangement),
          layoutCarryDone: persisted.layoutCarryDone === true,
        };
      },
      partialize: (state) => ({
        basePreset: state.basePreset,
        overrides: state.overrides,
        arrangement: state.arrangement,
        layoutCarryDone: state.layoutCarryDone,
      }),
    },
  ),
);

/**
 * Another window's layout write reaches this one live (L-32): every surface
 * this store drives is read at first paint, so a window that hydrated before
 * the write has to be told.
 */
installCrossWindowRehydrate(useLayoutStore, LAYOUT_PERSIST_KEY);

/** The persisted triple, for the seams that hold a snapshot rather than subscribe. */
export function getLayoutSnapshot(): LayoutSnapshot {
  const state = useLayoutStore.getState();
  return {
    basePreset: state.basePreset,
    overrides: state.overrides,
    arrangement: state.arrangement,
  };
}

/**
 * `statusBarShown` over the live store and the live viewport - the mount
 * decision the shell and the strip's own controls share.
 */
export function useStatusBarShown(): boolean {
  const isMobileViewport = useIsMobileViewport();
  return useLayoutStore((state) =>
    statusBarShown(state.arrangement, isMobileViewport),
  );
}

/**
 * Non-hook read of the Home tab, for the framework-free seams that gate on it
 * (route guards, the tab command coordinator, the keybinding dispatcher).
 */
export function isHomeTabEnabled(): boolean {
  const state = useLayoutStore.getState();
  return (
    (state.overrides.homeTab?.shown ??
      PRESET_VALUES[state.basePreset].homeTab.shown) === "shown"
  );
}

/**
 * The four values that actually shipped, carried into this store once (L-49).
 *
 * Verified against `desktop-v1.3.0`: the layout store itself is unreleased, so
 * nothing else is migrated (P5) - but the minimap side, the pinned context
 * breakdown, the resource-monitor switch and the sidebar's panel groups are on
 * users' machines, and losing them would be a visible regression on update.
 *
 * Written straight into this store's own record BEFORE it hydrates, rather
 * than folded into `merge`: zustand does not write a store back after an
 * ordinary merge, so a `merge` that reached for the old records would consult
 * them on every launch and a deliberate return to the default could never
 * survive a relaunch. `seedPersistedStateFromLegacyKeys` is the same move and
 * cannot serve here, because its "the key is already present" guard is exactly
 * what an unreleased v1 layout blob under this same key defeats; the carry
 * flag inside the record is the guard instead.
 *
 * Every field goes through the same total resolvers a normal rehydrate uses,
 * so a corrupt old record carries nothing rather than something malformed.
 */
function carryShippedLayoutValues(): void {
  try {
    const existing = readPersistedState(LAYOUT_PERSIST_KEY);
    if (existing !== null && existing.layoutCarryDone === true) return;
    const settings = readPersistedState(persistKey(STORE_KEYS.settings)) ?? {};
    const leftPanel =
      readPersistedState(persistKey(STORE_KEYS.leftPanel)) ?? {};
    // Handed to the resolvers as UNPARSED values, which is the point: the
    // carry decides which four things move, and the resolvers decide what
    // each of them is allowed to be.
    const overrides = {
      minimap: {
        shown: settings.chatTurnMinimapSide === "hide" ? "hidden" : "shown",
      },
      contextUsage: {
        pinBreakdown: settings.pinContextUsageBreakdown,
        pinnedFields: settings.pinnedContextBreakdownFields,
      },
      resourceMonitor: {
        shown:
          settings.showGlobalResourceMonitor === false ? "hidden" : "shown",
      },
    };
    const arrangement = {
      // `"hide"` is not a side, so the resolver falls back to the default one
      // and the value above is what carries the hidden state.
      minimapSide: settings.chatTurnMinimapSide,
      pinnedContextFieldOrder: settings.pinnedContextBreakdownOrder,
      rail: carriedRail(leftPanel.panelGroups),
    };
    window.localStorage.setItem(
      LAYOUT_PERSIST_KEY,
      JSON.stringify({
        state: {
          basePreset: DEFAULT_LAYOUT_SNAPSHOT.basePreset,
          overrides: resolvePersistedOverrides(
            overrides,
            DEFAULT_LAYOUT_SNAPSHOT.basePreset,
          ),
          arrangement: resolvePersistedArrangement(arrangement),
          layoutCarryDone: true,
        },
        version: LAYOUT_PERSIST_VERSION,
      }),
    );
  } catch {
    // Nothing here is worth failing a launch over: the store starts at its
    // defaults, exactly as on a fresh install, and tries again next launch.
  }
}

/** The sidebar's persisted groups, as the rail's dividers (L-25). */
function carriedRail(value: unknown): ReadonlyArray<RailEntry> {
  if (!Array.isArray(value)) return DEFAULT_ARRANGEMENT.rail;
  const groups = value.flatMap((group): ReadonlyArray<string>[] => {
    if (!isRecord(group) || !Array.isArray(group.panelIds)) return [];
    return [
      group.panelIds.filter(
        (panelId): panelId is string => typeof panelId === "string",
      ),
    ];
  });
  return groups.length === 0
    ? DEFAULT_ARRANGEMENT.rail
    : railFromPanelIdGroups(groups, 0);
}

/** One persisted record's `state` object, or `null` if it is not readable. */
function readPersistedState(name: string): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(name);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    return isRecord(parsed.state) ? parsed.state : null;
  } catch {
    return null;
  }
}

function isLayoutPresetId(value: unknown): value is LayoutPresetId {
  return LAYOUT_PRESET_IDS.some((presetId) => presetId === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
