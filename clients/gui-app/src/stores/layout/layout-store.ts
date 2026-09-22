import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import {
  DEFAULT_ARRANGEMENT,
  statusBarShown,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import {
  normalizeArrangement,
  resolvePersistedArrangement,
} from "@/lib/layout/arrangement-persist";
import {
  RAIL_REGION_BY_PANEL,
  railFromPanelIdGroups,
  railVisibilityFor,
  type RailEntry,
} from "@/lib/layout/rail";
import { sameRegionValue, type LayoutValues } from "@/lib/layout/layout-values";
import {
  LAYOUT_PRESET_IDS,
  PRESET_VALUES,
  type LayoutPresetId,
} from "@/lib/layout/layout-presets";
import { resolvePersistedOverrides } from "@/lib/layout/layout-values-persist";
import {
  legacyLeftPanelRecord,
  legacySettingsRecord,
} from "@/lib/layout/legacy-layout-records";
import type {
  LayoutSnapshot,
  LayoutValueKeysByRegion,
  LayoutValuePatches,
} from "@/lib/layout/layout-snapshot";
import type { RegionId } from "@/lib/layout/region-id";
import {
  basePersistOptions,
  installCrossWindowRehydrate,
  persistKey,
  STORE_KEYS,
} from "@/lib/persist";

/**
 * The one store the layout editor writes and every chrome surface reads
 * (L-21): a density preset, the user's own per-region delta and where things
 * live - the {@link LayoutSnapshot} triple, plus the writers for it.
 *
 * The delta is what a person PICKED, not what happens to differ from the
 * current preset (L-133). Which of those picks is a CHANGE is a question
 * about the base that is current right now, and `layout-diff.ts` answers it by
 * difference at every point it is asked - the row's dot, its revert, the
 * header count and the analytics snapshot.
 */
export interface LayoutStoreState extends LayoutSnapshot {
  /**
   * Whether the one-shot carry of the five shipped values has run (L-49,
   * L-61). Persisted in this same blob, which is what makes it one-shot.
   */
  readonly layoutCarryDone: boolean;
  readonly setBasePreset: (preset: LayoutPresetId) => void;
  readonly setRegionValues: <K extends RegionId>(
    region: K,
    patch: Partial<LayoutValues[K]>,
  ) => void;
  readonly setRegionValuesMany: (patches: LayoutValuePatches) => void;
  /**
   * Those keys taken OUT of one region's delta, which is what a revert is
   * (L-133).
   *
   * Distinct from writing the base preset's value back, and the difference is
   * the whole of L-133: the delta holds what a person picked, so writing the
   * base value records a pick for it - pinning the region to today's density
   * rather than letting it follow the next one. Reverting removes the answer.
   */
  readonly clearRegionValues: (
    region: RegionId,
    keys: ReadonlyArray<string>,
  ) => void;
  /**
   * The same revert across several regions, in ONE write (G1-09).
   *
   * "Reset panel visibility" takes the answer back for all nine rail regions
   * at once, and nine separate writes are nine renders and, inside a session,
   * nine snapshots taken of a layout that is mid-change.
   */
  readonly clearRegionValuesMany: (
    keysByRegion: LayoutValueKeysByRegion,
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
 * translated. The five values that DID ship are carried separately, below.
 */
const LAYOUT_PERSIST_VERSION = 2;

const SHIPPED_CARRY = carryShippedLayoutValues();

export const useLayoutStore = create<LayoutStoreState>()(
  persist(
    (set, get) => ({
      // The carry writes its result into this store's own record before the
      // store exists, so the ordinary rehydrate below picks it up. It is ALSO
      // seeded here, for the one case a rehydrate cannot cover: a quota
      // failure on that write, which would otherwise discard the carry AND
      // leave the flag unset, so the next launch carried over whatever the
      // user had changed in between (G1-24).
      ...(SHIPPED_CARRY ?? DEFAULT_LAYOUT_SNAPSHOT),
      layoutCarryDone: SHIPPED_CARRY !== null,
      setBasePreset: (basePreset) => {
        const state = get();
        if (state.basePreset === basePreset) return;
        // The preset, and NOTHING else (L-133). It used to re-minimize the
        // delta against the new base, which reads as tidying and is a
        // deletion: every per-region change the incoming preset happened to
        // agree with was dropped, so switching density and switching back lost
        // the user's own picks - and on the Settings page, which has no Undo
        // (L-108), lost them for good. The picks stay; whether any of them is
        // a CHANGE is a question about the current base and is answered by
        // difference wherever it is asked (`layout-diff.ts`).
        set({ basePreset });
      },
      setRegionValues: (region, patch) => {
        set(nextOverrides(get(), { [region]: patch }));
      },
      setRegionValuesMany: (patches) => {
        set(nextOverrides(get(), patches));
      },
      clearRegionValues: (region, keys) => {
        const next = clearedOverrides(get(), { [region]: keys });
        if (next !== null) set(next);
      },
      clearRegionValuesMany: (keysByRegion) => {
        const next = clearedOverrides(get(), keysByRegion);
        if (next !== null) set(next);
      },
      setArrangement: (arrangement) => {
        set({ arrangement: normalizeArrangement(arrangement) });
      },
      replaceAll: (next) => {
        set({
          basePreset: next.basePreset,
          // Verbatim, because this is the seam Undo, Redo and Discard restore
          // a whole snapshot through: minimizing here would make a history
          // step that crosses a preset boundary lossy, which is the same
          // defect L-133 closed one level up.
          overrides: next.overrides,
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
          overrides: resolvePersistedOverrides(persisted.overrides),
          arrangement: resolvePersistedArrangement(persisted.arrangement),
          layoutCarryDone:
            persisted.layoutCarryDone === true || SHIPPED_CARRY !== null,
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
 * One or more regions' patches merged into the delta, through the SAME total
 * resolver a rehydrate runs.
 *
 * The resolver on the write path is what makes the registry's stringly-typed
 * control seam sound about the VALUE as well as the key (G1-08): a registry
 * typo like `"ringonly"` cannot reach the store, be drawn from a default
 * branch for a session and then vanish on the next launch when the read-side
 * resolver drops it. Write and read are now the same parse.
 */
/**
 * One or more regions' keys taken back OUT of the delta, through that same
 * resolver - which is also what drops a region entirely once nothing of it is
 * left.
 *
 * `null` rather than an unchanged object when no named region holds a delta at
 * all: the resolver mints a fresh object every call, so a `set` on that path
 * would notify every subscriber for a revert that reverted nothing.
 */
function clearedOverrides(
  state: LayoutSnapshot,
  keysByRegion: Readonly<Record<string, ReadonlyArray<string> | undefined>>,
): Pick<LayoutSnapshot, "overrides"> | null {
  const merged: Record<string, unknown> = { ...state.overrides };
  let touched = false;
  for (const [region, keys] of Object.entries(keysByRegion)) {
    const current = merged[region];
    if (keys === undefined || !isRecord(current)) continue;
    const kept: Record<string, unknown> = { ...current };
    for (const key of keys) delete kept[key];
    merged[region] = kept;
    touched = true;
  }
  if (!touched) return null;
  return { overrides: resolvePersistedOverrides(merged) };
}

function nextOverrides(
  state: LayoutSnapshot,
  patches: LayoutValuePatches,
): Pick<LayoutSnapshot, "overrides"> {
  const merged: Record<string, unknown> = { ...state.overrides };
  for (const [region, patch] of Object.entries(patches)) {
    const current = merged[region];
    merged[region] = { ...(isRecord(current) ? current : {}), ...patch };
  }
  return { overrides: resolvePersistedOverrides(merged) };
}

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
 * The persisted triple as one subscribed value, for the editor's own surfaces.
 *
 * Three selectors rather than one returning `{ ... }`: a selector that
 * allocates defeats `useSyncExternalStore`'s caching and free-runs the
 * component (React's "getSnapshot should be cached" loop). The `useMemo` is
 * what makes the RESULT stable for a consumer that passes it on.
 */
export function useLayoutSnapshot(): LayoutSnapshot {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  return useMemo(
    () => ({ basePreset, overrides, arrangement }),
    [basePreset, overrides, arrangement],
  );
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
 * The five values that actually shipped, carried into this store once (L-49,
 * L-61), or `null` when there is nothing to carry.
 *
 * Verified against `desktop-v1.3.0`: the layout store itself is unreleased, so
 * nothing else is migrated (P5) - but the minimap side, the pinned context
 * breakdown, the resource-monitor switch, the sidebar's panel groups and the
 * rail's per-panel Hide/Show are on users' machines, and losing any of them
 * would be a visible regression on update.
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
 * The legacy bytes come from `legacy-layout-records.ts` rather than from
 * `localStorage` here, which is what makes this independent of which store
 * module the entry path loaded first - see that module's header. Every field
 * goes through the same total resolvers a normal rehydrate uses, so a corrupt
 * old record carries nothing rather than something malformed.
 */
function carryShippedLayoutValues(): LayoutSnapshot | null {
  const existing = readLayoutRecord();
  if (existing !== null && existing.layoutCarryDone === true) return null;
  const settings = legacySettingsRecord();
  const leftPanel = legacyLeftPanelRecord();
  // Handed to the resolvers as UNPARSED values, which is the point: the carry
  // decides which five things move, and the resolvers decide what each of
  // them is allowed to be.
  // Only what the old record actually DIFFERS on. It used to write `shown`
  // for the minimap and the resource monitor unconditionally and lean on the
  // delta being re-minimized afterwards; the delta is the user's own picks now
  // (L-133), so a carry that writes the shipped value would put a preference
  // on record for something nobody ever expressed one about.
  const overrides = {
    ...(settings.chatTurnMinimapSide === "hide"
      ? { minimap: { shown: "hidden" } }
      : {}),
    ...carriedContextUsage(settings),
    ...(settings.showGlobalResourceMonitor === false
      ? { resourceMonitor: { shown: "hidden" } }
      : {}),
    ...carriedRailVisibility(leftPanel.panelVisibilityOverrideById),
  };
  const arrangement = {
    // `"hide"` is not a side, so the resolver falls back to the default one
    // and the value above is what carries the hidden state.
    minimapSide: settings.chatTurnMinimapSide,
    pinnedContextFieldOrder: settings.pinnedContextBreakdownOrder,
    rail: carriedRail(leftPanel.panelGroups),
  };
  const carried: LayoutSnapshot = {
    basePreset: DEFAULT_LAYOUT_SNAPSHOT.basePreset,
    overrides: resolvePersistedOverrides(overrides),
    arrangement: resolvePersistedArrangement(arrangement),
  };
  try {
    window.localStorage.setItem(
      LAYOUT_PERSIST_KEY,
      JSON.stringify({
        state: { ...carried, layoutCarryDone: true },
        version: LAYOUT_PERSIST_VERSION,
      }),
    );
  } catch {
    // A quota failure is not worth failing a launch over, and it is not worth
    // losing the carry over either: the snapshot is returned regardless and
    // seeds the store's initial state, so the values are on screen and the
    // store's own first persist write records the flag.
  }
  return carried;
}

/**
 * The two context-usage picks, by DIFFERENCE against the shipped Default -
 * the same rule the minimap and the resource monitor follow above, and the
 * one the carry's own comment states.
 *
 * It used to write both keys unconditionally and lean on `minimizeOverrides`
 * erasing the redundant half afterwards. Nothing erases it now: the delta IS
 * the user's own answers (L-133), so an unconditional carry would put a
 * preference on record for something every upgrading user never expressed -
 * and the Detailed preset, whose `pinBreakdown` is `true`, would then draw no
 * pinned breakdown and read as "Detailed + 1 change" on a layout nobody has
 * touched.
 *
 * Both values arrive UNPARSED, so each is tested for its own shape first: a
 * non-boolean and a non-list are not preferences, and carrying one would hand
 * the resolver a key it drops and leave a region behind that says nothing.
 */
function carriedContextUsage(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const base = PRESET_VALUES.default.contextUsage;
  const pinBreakdown = settings.pinContextUsageBreakdown;
  const pinnedFields = settings.pinnedContextBreakdownFields;
  const picks = {
    ...(typeof pinBreakdown === "boolean" && pinBreakdown !== base.pinBreakdown
      ? { pinBreakdown }
      : {}),
    ...(Array.isArray(pinnedFields) &&
    !sameRegionValue("pinnedFields", pinnedFields, base.pinnedFields)
      ? { pinnedFields }
      : {}),
  };
  return Object.keys(picks).length === 0 ? {} : { contextUsage: picks };
}

/**
 * The rail's per-panel Hide/Show as the nine rail regions' tri-state `shown`
 * (L-61). An absent entry is `auto`, which is the default, so it carries
 * nothing and the resolver drops it.
 */
function carriedRailVisibility(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const overrides: Record<string, unknown> = {};
  for (const [panelId, regionId] of Object.entries(RAIL_REGION_BY_PANEL)) {
    const override = value[panelId];
    if (typeof override !== "boolean") continue;
    overrides[regionId] = { shown: railVisibilityFor(override) };
  }
  return overrides;
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

/** This store's own persisted record, or `null` if it is not readable. */
function readLayoutRecord(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(LAYOUT_PERSIST_KEY);
    if (raw === null) return null;
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
