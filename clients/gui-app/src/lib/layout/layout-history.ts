import { type LayoutArrangement } from "@/lib/layout/layout-arrangement";
import { resolvePersistedArrangement } from "@/lib/layout/arrangement-persist";
import { resolvePersistedOverrides } from "@/lib/layout/layout-values-persist";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";

/**
 * Undo, Redo and Discard, as pure operations over whole snapshots (L-18).
 *
 * A snapshot rather than a patch per gesture: the store's whole state is a
 * preset id, a minimal delta and an arrangement - small enough that storing 80
 * of them is cheaper than the per-slice patches the old editor carried, and
 * exact, because a patch that names slices has to be right about which slices
 * a gesture touched.
 */

export interface LayoutHistory {
  /** Snapshots to go back TO, oldest first. */
  readonly past: ReadonlyArray<LayoutSnapshot>;
  /** Snapshots to go forward TO, oldest first. */
  readonly future: ReadonlyArray<LayoutSnapshot>;
}

export const EMPTY_LAYOUT_HISTORY: LayoutHistory = { past: [], future: [] };

/**
 * Deep enough for a whole editing session and shallow enough that the oldest
 * entries are no longer worth keeping in memory.
 */
export const LAYOUT_HISTORY_CAP = 80;

/** Where one step of travel lands: the new stacks and the snapshot to apply. */
export interface LayoutTravel {
  readonly history: LayoutHistory;
  readonly snapshot: LayoutSnapshot;
}

/**
 * One gesture recorded. `before` is the state the gesture replaced, so Undo
 * restores it; the redo stack is dropped, because a new gesture is a new
 * branch.
 */
export function recordLayoutChange(
  history: LayoutHistory,
  before: LayoutSnapshot,
): LayoutHistory {
  return {
    past: [...history.past, before].slice(-LAYOUT_HISTORY_CAP),
    future: [],
  };
}

/** One step back, or `null` when there is nothing to go back to. */
export function undoLayout(
  history: LayoutHistory,
  current: LayoutSnapshot,
): LayoutTravel | null {
  const snapshot = history.past.at(-1);
  if (snapshot === undefined) return null;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
    },
    snapshot,
  };
}

/** One step forward, or `null` when nothing was undone. */
export function redoLayout(
  history: LayoutHistory,
  current: LayoutSnapshot,
): LayoutTravel | null {
  const snapshot = history.future.at(-1);
  if (snapshot === undefined) return null;
  return {
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1),
    },
    snapshot,
  };
}

/**
 * The entry snapshot moved onto a write the editor did not make (L-18).
 *
 * "Discard changes" restores the state the session started from, so a write
 * from ANOTHER window - or from a settings surface outside the editor - must
 * not be undone by it: whatever the external write changed becomes part of
 * what Discard restores, and everything else stays as it was on entry. History
 * is left alone, which is the difference from the old editor: it wiped the
 * stacks on any external write.
 *
 * The grain is the field, and the region for values: two writers touching the
 * same region in the same window is the case this cannot be exact about, and
 * the external writer wins it.
 */
export function rebaseLayoutSnapshot(
  entry: LayoutSnapshot,
  previous: LayoutSnapshot,
  next: LayoutSnapshot,
): LayoutSnapshot {
  const basePreset = pick(
    entry.basePreset,
    previous.basePreset,
    next.basePreset,
  );
  return {
    basePreset,
    overrides: rebaseOverrides(entry, previous, next, basePreset),
    arrangement: rebaseArrangement(
      entry.arrangement,
      previous.arrangement,
      next.arrangement,
    ),
  };
}

function rebaseOverrides(
  entry: LayoutSnapshot,
  previous: LayoutSnapshot,
  next: LayoutSnapshot,
  basePreset: LayoutSnapshot["basePreset"],
): LayoutSnapshot["overrides"] {
  const entryRegions: Record<string, unknown> = entry.overrides;
  const previousRegions: Record<string, unknown> = previous.overrides;
  const nextRegions: Record<string, unknown> = next.overrides;
  const rebased: Record<string, unknown> = {};
  const regions = new Set([
    ...Object.keys(entryRegions),
    ...Object.keys(previousRegions),
    ...Object.keys(nextRegions),
  ]);
  for (const region of regions) {
    rebased[region] = pick(
      entryRegions[region],
      previousRegions[region],
      nextRegions[region],
    );
  }
  // Back through the persisted resolver rather than trusted: the map was
  // assembled from three sources under dynamic keys, and this is the same
  // total parse a rehydrate runs.
  return resolvePersistedOverrides(rebased, basePreset);
}

function rebaseArrangement(
  entry: LayoutArrangement,
  previous: LayoutArrangement,
  next: LayoutArrangement,
): LayoutArrangement {
  return resolvePersistedArrangement({
    dock: pick(entry.dock, previous.dock, next.dock),
    toolbarLeft: pick(
      entry.toolbarLeft,
      previous.toolbarLeft,
      next.toolbarLeft,
    ),
    toolbarRight: pick(
      entry.toolbarRight,
      previous.toolbarRight,
      next.toolbarRight,
    ),
    rail: pick(entry.rail, previous.rail, next.rail),
    usageProviders: pick(
      entry.usageProviders,
      previous.usageProviders,
      next.usageProviders,
    ),
    hiddenProviders: pick(
      entry.hiddenProviders,
      previous.hiddenProviders,
      next.hiddenProviders,
    ),
    providerLimits: pick(
      entry.providerLimits,
      previous.providerLimits,
      next.providerLimits,
    ),
    shownProfiles: pick(
      entry.shownProfiles,
      previous.shownProfiles,
      next.shownProfiles,
    ),
    usageHost: pick(entry.usageHost, previous.usageHost, next.usageHost),
    resourceSide: pick(
      entry.resourceSide,
      previous.resourceSide,
      next.resourceSide,
    ),
    minimapSide: pick(
      entry.minimapSide,
      previous.minimapSide,
      next.minimapSide,
    ),
    pinnedContextFieldOrder: pick(
      entry.pinnedContextFieldOrder,
      previous.pinnedContextFieldOrder,
      next.pinnedContextFieldOrder,
    ),
    mobileFooter: pick(
      entry.mobileFooter,
      previous.mobileFooter,
      next.mobileFooter,
    ),
    dividerSeq: Math.max(entry.dividerSeq, next.dividerSeq),
  });
}

/**
 * One field's rebased value: the external write's if it moved the field, the
 * entry's otherwise.
 *
 * Compared as JSON because these are plain data built by the same resolvers on
 * both sides, so key order is not a variable - the same comparison the editor
 * this replaces used to decide a gesture had changed anything.
 */
function pick<Value>(entry: Value, previous: Value, next: Value): Value {
  return JSON.stringify(previous) === JSON.stringify(next) ? entry : next;
}
