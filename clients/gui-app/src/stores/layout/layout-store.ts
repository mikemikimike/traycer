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
  normalizeRail,
  RAIL_REGION_BY_PANEL,
  railFromPanelIdOrder,
  railStackId,
  railVisibilityFor,
  type RailEntry,
} from "@/lib/layout/rail";
import type { RailRegionId } from "@/lib/layout/region-id";
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
 * (L-21): the last-applied preset, the user's own per-region delta on top of
 * it and where things live - the {@link LayoutSnapshot} triple, plus the
 * writers for it. Which values are a CHANGE is answered by difference against
 * the last-applied preset (`layout-diff.ts`).
 */
export interface LayoutStoreState extends LayoutSnapshot {
  /**
   * Whether the one-shot carry of the five shipped values has run (L-49,
   * L-61). Persisted in this same blob, which is what makes it one-shot.
   */
  readonly layoutCarryDone: boolean;
  /**
   * Every value replaced by the preset's, the arrangement untouched: the
   * delta is cleared and `basePreset` becomes the last-applied preset.
   */
  readonly applyPreset: (preset: LayoutPresetId) => void;
  readonly setRegionValues: <K extends RegionId>(
    region: K,
    patch: Partial<LayoutValues[K]>,
  ) => void;
  /**
   * Those keys taken OUT of one region's delta, which is what a revert is:
   * the value falls back to the last-applied preset's.
   */
  readonly clearRegionValues: (
    region: RegionId,
    keys: ReadonlyArray<string>,
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
 * Version 2 was bumped for the new shape with no `migrate`, because the layout
 * store is unreleased (L-22) and a blob written by a development build is
 * discarded rather than translated. Version 3 is the exception (L-158): the
 * shipped rail put a divider between every panel, and a record written before
 * L-155 holds all seven whatever else it holds, so it needs translating rather
 * than discarding - discarding it would take the user's panel ORDER with it.
 * Version 4 is the same exception one ruling later (L-166): stacks did not
 * exist between L-155 and L-166, so a v3 record names none, and left as it is
 * a dogfooder would be the one user in the world whose sidebar never draws
 * Agents and Artifacts together. The five values that DID ship are carried
 * separately, below. Version 5 splits the agent rows' resource readings off
 * the monitor's Shown (G7, `withSplitResourceReadings`). Version 6 moves Tab
 * overflow in from the settings store (`withCarriedTaskTabLayout`).
 */
const LAYOUT_PERSIST_VERSION = 6;

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
      applyPreset: (basePreset) => {
        // Re-applying the untouched current preset writes nothing: a set here
        // would still persist and rehydrate every other window.
        const current = get();
        if (
          current.basePreset === basePreset &&
          Object.keys(current.overrides).length === 0
        )
          return;
        set({ basePreset, overrides: {} });
      },
      setRegionValues: (region, patch) => {
        set(nextOverrides(get(), { [region]: patch }));
      },
      clearRegionValues: (region, keys) => {
        const next = clearedOverrides(get(), { [region]: keys });
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
      migrate: migrateLayoutPersistedState,
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
 * Non-hook read of Thinking's Shown, for the lazy transcript projections (Find,
 * a block reveal) that must group runs exactly as the renderer does.
 */
export function isThinkingShown(): boolean {
  const state = useLayoutStore.getState();
  return (
    (state.overrides.thinking?.shown ??
      PRESET_VALUES[state.basePreset].thinking.shown) === "shown"
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
    // Both halves: that one switch hid the agent rows' readings too (G7).
    ...(settings.showGlobalResourceMonitor === false
      ? { resourceMonitor: { shown: "hidden", agentRows: false } }
      : {}),
    ...carriedRailVisibility(leftPanel.panelVisibilityOverrideById),
  };
  const arrangement = {
    // `"hide"` is not a side, so the resolver falls back to the default one
    // and the value above is what carries the hidden state.
    minimapSide: settings.chatTurnMinimapSide,
    pinnedContextFieldOrder: settings.pinnedContextBreakdownOrder,
    rail: carriedRail(leftPanel.panelGroups),
    taskTabLayout: settings.taskTabLayout,
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

/**
 * The sidebar's persisted grouping, as the rail's panel ORDER and its stacks
 * (L-155, L-166).
 *
 * The order is the user's and so is a group that actually drew two panels
 * together, which is what a stack IS. What does not come across is a group of
 * ONE: the shipped sidebar put every lone panel in a group of its own and a
 * divider between every pair, and neither of those was a thing anybody placed.
 *
 * A group of three or more carries its first two, because a stack joins
 * exactly two panels (L-166) and the first two are the pair that was drawn at
 * the top of that group's body. The rest of the group keeps its ORDER and
 * simply stands alone, which is the same trade the divider drop made.
 */
function carriedRail(value: unknown): ReadonlyArray<RailEntry> {
  if (!Array.isArray(value)) return DEFAULT_ARRANGEMENT.rail;
  const groups = value.flatMap(
    (group): ReadonlyArray<ReadonlyArray<string>> => {
      if (!isRecord(group) || !Array.isArray(group.panelIds)) return [];
      return [
        group.panelIds.filter(
          (panelId): panelId is string => typeof panelId === "string",
        ),
      ];
    },
  );
  const panelIds = groups.flat();
  if (panelIds.length === 0) return DEFAULT_ARRANGEMENT.rail;
  const rail = railFromPanelIdOrder(panelIds);
  // A group carries every member it still has (L-181), not only its first
  // two: a stack is the members its id names.
  const links = groups.flatMap((group): RailEntry[] => {
    const members = group.flatMap((panelId) => {
      const regionId = carriedRailRegion(panelId);
      return regionId === null ? [] : [regionId];
    });
    return members.length < 2
      ? []
      : [{ kind: "stack", id: railStackId(members) }];
  });
  // Appended rather than threaded in: a stack IS the members its id names, so
  // `normalizeRail` puts each one where it belongs and keeps only the members
  // this build ended up placing side by side.
  return normalizeRail([...rail, ...links]);
}

/** One `panelGroups` id as a rail region, or `null` for one this build retired. */
function carriedRailRegion(panelId: string): RailRegionId | null {
  const match = Object.entries(RAIL_REGION_BY_PANEL).find(
    ([candidate]) => candidate === panelId,
  );
  return match === undefined ? null : match[1];
}

/**
 * Two one-shot repairs of a stored rail, each for a ruling that changed what a
 * rail entry means.
 *
 * v3 (L-158): every divider dropped. The rail a version-2 record holds was
 * written when the shipped default put one between every panel, so those seven
 * are structure this build no longer has rather than spacers anyone placed -
 * the same judgement the one-shot carry makes about the shipped `panelGroups`.
 *
 * v4 (L-166): the default stack put back, and only where it still means what
 * it meant. A v3 record was written in the window where stacking did not
 * exist, so it names none, and nothing in it distinguishes "I never had a
 * stack" from "I moved these two apart" - what it DOES say is whether Agents
 * is still immediately followed by Artifacts. If it is, the record agrees with
 * the shipped order at exactly the place the default stack joins, and the join
 * is the default the user has simply never seen. If it is not, the user moved
 * one of them, and inserting a link would either re-join two panels they had
 * separated or join a pair they never chose - so that record gets none.
 *
 * The user's panel ORDER is theirs throughout and is never touched.
 * `dividerSeq` is left where it is on purpose: it is the counter that keeps a
 * new divider's id unique, and winding it back would reissue an id a removed
 * divider already used.
 */
function migrateLayoutPersistedState(
  persistedState: unknown,
  version: number,
): unknown {
  if (!isRecord(persistedState)) return persistedState;
  const railed =
    version >= 4 ? persistedState : migrateRail(persistedState, version);
  const split = version >= 5 ? railed : withSplitResourceReadings(railed);
  return version >= 6 ? split : withCarriedTaskTabLayout(split);
}

/**
 * Version 6: Tab overflow used to live in the settings store as
 * `taskTabLayout`, outside the layout, so Undo, Discard and Reset layout could
 * not reach it. The settings record as this launch found it carries the value
 * over once; the arrangement resolver decides whether it is one this build
 * knows.
 */
function withCarriedTaskTabLayout(
  persistedState: Record<string, unknown>,
): Record<string, unknown> {
  const arrangement = isRecord(persistedState.arrangement)
    ? persistedState.arrangement
    : {};
  return {
    ...persistedState,
    arrangement: {
      ...arrangement,
      taskTabLayout: legacySettingsRecord().taskTabLayout,
    },
  };
}

/**
 * Version 5 (G7): the agent rows' readings used to ride the monitor's Shown,
 * and now have their own `agentRows`. A record that hid the monitor hid the
 * rows too, so it keeps them hidden; every other record takes the shipped
 * `true`. Done here, once, rather than in the value resolver, which also runs
 * on every write - there it would re-couple the two on each later Hide.
 */
function withSplitResourceReadings(
  persistedState: Record<string, unknown>,
): Record<string, unknown> {
  const overrides = persistedState.overrides;
  if (!isRecord(overrides)) return persistedState;
  const monitor = overrides.resourceMonitor;
  if (!isRecord(monitor) || monitor.shown !== "hidden") return persistedState;
  if (typeof monitor.agentRows === "boolean") return persistedState;
  return {
    ...persistedState,
    overrides: {
      ...overrides,
      resourceMonitor: { ...monitor, agentRows: false },
    },
  };
}

function migrateRail(
  persistedState: Record<string, unknown>,
  version: number,
): Record<string, unknown> {
  const arrangement = persistedState.arrangement;
  if (!isRecord(arrangement) || !Array.isArray(arrangement.rail)) {
    return persistedState;
  }
  const withoutShippedDividers =
    version >= 3
      ? arrangement.rail
      : arrangement.rail.filter(
          (entry) => !(isRecord(entry) && entry.kind === "divider"),
        );
  const rail = withDefaultStack(withoutShippedDividers);
  return {
    ...persistedState,
    arrangement: { ...arrangement, rail },
  };
}

/** The default link, put in only where the default pair is still adjacent. */
function withDefaultStack(
  rail: ReadonlyArray<unknown>,
): ReadonlyArray<unknown> {
  const agents = rail.findIndex(
    (entry) =>
      isRecord(entry) && entry.kind === "panel" && entry.id === "railAgents",
  );
  if (agents < 0) return rail;
  const next = rail[agents + 1];
  if (!isRecord(next) || next.kind !== "panel" || next.id !== "railArtifacts") {
    return rail;
  }
  return [
    ...rail.slice(0, agents + 1),
    { kind: "stack", id: railStackId(["railAgents", "railArtifacts"]) },
    ...rail.slice(agents + 1),
  ];
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
