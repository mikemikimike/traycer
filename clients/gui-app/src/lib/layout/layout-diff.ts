import {
  DEFAULT_ARRANGEMENT,
  ORDER_GROUP_IDS,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import { leftPanelGroupsFromRail } from "@/lib/layout/rail";
import {
  overrideKeys,
  sameFieldList,
  sameRegionValue,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";

/**
 * What is different from the base preset, and the way back.
 *
 * The scope is settled (C-11) and deliberately narrower than "everything a
 * user could have touched": a change is a VALUE that differs from the base
 * preset, an order group that is no longer in its default order, or a provider
 * switched off the strip. Presets are density-only (L-20), so putting the
 * arrangement back is a separate gesture and `resetToBase` leaves it alone.
 */

/** Which keys of one region differ from the base preset, in the patch's order. */
function changedKeys<K extends RegionId>(
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
 * changes"): one per changed VALUE, and nothing else (L-57).
 *
 * Values only, because the count has to agree with the button beside it:
 * "Reset to Compact" reverts exactly the delta this counts, and a count that
 * also carried the arrangement would leave changes behind after a reset that
 * claimed to clear them. An arrangement change is still a change a person
 * made - it earns a dot in the index and a revert on its own Position row
 * (`positionRowChanged`).
 */
export function changeCount(snapshot: LayoutSnapshot): number {
  // No re-minimizing: `overrides` is invariantly minimal, because every write
  // path into the store (`setRegionValues`, `setRegionValuesMany`,
  // `setBasePreset`, `replaceAll`) and every rehydrate ends in the same
  // resolver. Re-deriving it here allocated twenty-two objects on every filter
  // keystroke to confirm what the store already guarantees (G1-21).
  return Object.values(snapshot.overrides).reduce(
    (total: number, patch: object | undefined) =>
      total + (patch === undefined ? 0 : Object.keys(patch).length),
    0,
  );
}

/** Every order group whose order is no longer the default one. */
export function reorderedGroups(
  arrangement: LayoutArrangement,
): ReadonlyArray<OrderGroupId> {
  return ORDER_GROUP_IDS.filter(
    (group) =>
      !sameFieldList(orderIds(arrangement, group), defaultOrderIds(group)),
  );
}

/** Every value back to the base preset. Values only: the arrangement stays. */
export function resetToBase(snapshot: LayoutSnapshot): LayoutSnapshot {
  return { ...snapshot, overrides: {} };
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
