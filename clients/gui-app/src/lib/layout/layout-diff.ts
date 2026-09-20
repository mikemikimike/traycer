import {
  DEFAULT_ARRANGEMENT,
  leftPanelGroupsFromRail,
  ORDER_GROUP_IDS,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import {
  minimizeOverrides,
  overrideKeys,
  PRESET_VALUES,
  sameRegionValue,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  type LayoutSnapshot,
} from "@/stores/layout/layout-store";

/**
 * What is different from the base preset, and the four ways back.
 *
 * The scope is settled (C-11) and deliberately narrower than "everything a
 * user could have touched": a change is a VALUE that differs from the base
 * preset, an order group that is no longer in its default order, or a provider
 * switched off the strip. Presets are density-only (L-20), so putting the
 * arrangement back is a separate gesture - `resetToBase` leaves it alone and
 * only `resetEverything` clears it.
 */

/** Which keys of one region differ from the base preset, in the patch's order. */
export function changedKeys<K extends RegionId>(
  snapshot: LayoutSnapshot,
  region: K,
): ReadonlyArray<keyof LayoutValues[K] & string> {
  const patch = snapshot.overrides[region];
  if (patch === undefined) return [];
  const base = PRESET_VALUES[snapshot.basePreset][region];
  return overrideKeys(patch).filter(
    (key) => !sameRegionValue(key, patch[key], base[key]),
  );
}

/** Whether a region has anything to revert, which is what its dot draws. */
export function regionChanged(
  snapshot: LayoutSnapshot,
  region: RegionId,
): boolean {
  return changedKeys(snapshot, region).length > 0;
}

/**
 * The number the header reads out beside the preset name ("Compact + 3
 * changes"): one per changed value, one per reordered group, one per hidden
 * provider.
 */
export function changeCount(snapshot: LayoutSnapshot): number {
  const minimal = minimizeOverrides(snapshot.overrides, snapshot.basePreset);
  const valueChanges = Object.values(minimal).reduce(
    (total: number, patch: object | undefined) =>
      total + (patch === undefined ? 0 : Object.keys(patch).length),
    0,
  );
  return (
    valueChanges +
    reorderedGroups(snapshot.arrangement).length +
    snapshot.arrangement.hiddenProviders.length
  );
}

/** Every order group whose order is no longer the default one. */
export function reorderedGroups(
  arrangement: LayoutArrangement,
): ReadonlyArray<OrderGroupId> {
  return ORDER_GROUP_IDS.filter(
    (group) => !sameOrder(orderIds(arrangement, group), defaultOrderIds(group)),
  );
}

/**
 * One row put back: the keys are dropped from the delta, which is the same
 * thing as taking the base preset's answer for them (L-20).
 */
export function revertKeys<K extends RegionId>(
  snapshot: LayoutSnapshot,
  region: K,
  keys: ReadonlyArray<keyof LayoutValues[K] & string>,
): LayoutSnapshot {
  const patch = snapshot.overrides[region];
  if (patch === undefined) return snapshot;
  const kept: Partial<LayoutValues[K]> = { ...patch };
  for (const key of keys) delete kept[key];
  return {
    ...snapshot,
    overrides: minimizeOverrides(
      { ...snapshot.overrides, [region]: kept },
      snapshot.basePreset,
    ),
  };
}

/** Every value back to the base preset. Values only: the arrangement stays. */
export function resetToBase(snapshot: LayoutSnapshot): LayoutSnapshot {
  return { ...snapshot, overrides: {} };
}

/** The whole page back: values, arrangement and the base preset itself. */
export function resetEverything(): LayoutSnapshot {
  return DEFAULT_LAYOUT_SNAPSHOT;
}

/**
 * One order group's ids.
 *
 * The rail is read as its GROUPING rather than as its entries: divider ids are
 * issued from a counter that only ever increases, so a divider removed and
 * added back would leave the rail permanently "reordered" against a default it
 * draws identically to.
 */
function orderIds(
  arrangement: LayoutArrangement,
  group: OrderGroupId,
): ReadonlyArray<string> {
  switch (group) {
    case "dock":
      return arrangement.dock;
    case "toolbarLeft":
      return arrangement.toolbarLeft;
    case "toolbarRight":
      return arrangement.toolbarRight;
    case "rail":
      return leftPanelGroupsFromRail(arrangement.rail).flatMap(
        (railGroup, index): string[] =>
          index === 0
            ? [...railGroup.panelIds]
            : [GROUP_BOUNDARY, ...railGroup.panelIds],
      );
    case "usageProviders":
      return arrangement.usageProviders;
  }
}

/** Stands for a divider in the rail's comparable order. Not a panel id. */
const GROUP_BOUNDARY = "|";

function defaultOrderIds(group: OrderGroupId): ReadonlyArray<string> {
  return orderIds(DEFAULT_ARRANGEMENT, group);
}

function sameOrder(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}
