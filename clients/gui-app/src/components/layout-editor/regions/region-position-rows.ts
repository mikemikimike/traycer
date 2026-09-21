import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  DEFAULT_ARRANGEMENT,
  type EdgeSide,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import { reorderedGroups } from "@/lib/layout/layout-diff";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * A region's Position row measured against, and put back to, the shipped
 * arrangement (L-57).
 *
 * The header's change count is values only, because that is exactly what
 * "Reset to Compact" puts back and the two have to agree. An arrangement
 * change is still a change a person made, so it earns a dot in the index and a
 * revert on the row it belongs to - measured against the DEFAULT arrangement
 * rather than against the base preset, which by construction has no opinion
 * about position.
 */

/**
 * Whether this region's Position row differs from the shipped arrangement.
 *
 * `false` for a region with no Position row, which includes every region whose
 * only row is Size or Style.
 */
export function positionRowChanged(
  snapshot: LayoutSnapshot,
  region: RegionId,
): boolean {
  const arrangement = snapshot.arrangement;
  const reordered = reorderedGroups(arrangement);
  return positionRows(region).some((row) => {
    switch (row.kind) {
      case "position-host":
        return arrangement.usageHost !== DEFAULT_ARRANGEMENT.usageHost;
      case "position-side":
        return (
          edgeSideFor(region, arrangement) !==
          edgeSideFor(region, DEFAULT_ARRANGEMENT)
        );
      case "position-order":
        return reordered.includes(row.group);
    }
  });
}

/**
 * Whether THIS region alone sits somewhere other than where it shipped - the
 * question the index's changed dot asks (I-17).
 *
 * The same three row shapes as {@link positionRowChanged}, and the same answer
 * for two of them: a host and a side are already this region's own. An order
 * group is where the two questions part. {@link positionRowChanged} asks about
 * the GROUP, which is right for the revert that puts the whole group back and
 * wrong for a dot: all nine rail regions share the `rail` group, and the
 * shipped panel grouping arrives as dividers (L-49), so one carried divider
 * lit every sidebar row before the user had touched anything.
 *
 * MOVED here means: this region's index among its group's REGIONS, counted
 * with the rail's dividers left out, differs from its index in
 * `DEFAULT_ARRANGEMENT`. Dividers are left out because adding one shifts every
 * entry below it without moving any panel relative to its neighbours - the
 * boundary moved, not the row. A region its group no longer holds is absent
 * from both lists and has not moved.
 */
export function regionPositionMoved(
  snapshot: LayoutSnapshot,
  region: RegionId,
): boolean {
  const arrangement = snapshot.arrangement;
  return positionRows(region).some((row) => {
    switch (row.kind) {
      case "position-host":
        return arrangement.usageHost !== DEFAULT_ARRANGEMENT.usageHost;
      case "position-side":
        return (
          edgeSideFor(region, arrangement) !==
          edgeSideFor(region, DEFAULT_ARRANGEMENT)
        );
      case "position-order":
        return (
          groupRegionIds(arrangement, row.group).indexOf(region) !==
          groupRegionIds(DEFAULT_ARRANGEMENT, row.group).indexOf(region)
        );
    }
  });
}

/** One order group's members, in order, dividers excluded. */
function groupRegionIds(
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
    case "usageProviders":
      return arrangement.usageProviders;
    case "rail":
      return arrangement.rail.flatMap((entry) =>
        entry.kind === "divider" ? [] : [entry.id],
      );
  }
}

/** This region's Position row put back, leaving every other row alone. */
export function revertPositionRow(
  arrangement: LayoutArrangement,
  region: RegionId,
): LayoutArrangement {
  return positionRows(region).reduce((current, row): LayoutArrangement => {
    switch (row.kind) {
      case "position-host":
        return { ...current, usageHost: DEFAULT_ARRANGEMENT.usageHost };
      case "position-side":
        return region === "minimap"
          ? { ...current, minimapSide: DEFAULT_ARRANGEMENT.minimapSide }
          : { ...current, resourceSide: DEFAULT_ARRANGEMENT.resourceSide };
      case "position-order":
        return revertOrderGroup(current, row.group);
    }
  }, arrangement);
}

type PositionRow =
  | { readonly kind: "position-host" }
  | { readonly kind: "position-side" }
  | { readonly kind: "position-order"; readonly group: OrderGroupId };

function positionRows(region: RegionId): ReadonlyArray<PositionRow> {
  return regionFacts(region).rows.flatMap((row): PositionRow[] => {
    if (row.kind === "position-host") return [{ kind: "position-host" }];
    if (row.kind === "position-side") return [{ kind: "position-side" }];
    if (row.kind === "position-order") {
      return [{ kind: "position-order", group: row.group }];
    }
    return [];
  });
}

/** The side the one `position-side` region in question is drawn on. */
function edgeSideFor(
  region: RegionId,
  arrangement: LayoutArrangement,
): EdgeSide {
  return region === "minimap"
    ? arrangement.minimapSide
    : arrangement.resourceSide;
}

function revertOrderGroup(
  arrangement: LayoutArrangement,
  group: OrderGroupId,
): LayoutArrangement {
  switch (group) {
    case "dock":
      return { ...arrangement, dock: DEFAULT_ARRANGEMENT.dock };
    case "toolbarLeft":
      return { ...arrangement, toolbarLeft: DEFAULT_ARRANGEMENT.toolbarLeft };
    case "toolbarRight":
      return { ...arrangement, toolbarRight: DEFAULT_ARRANGEMENT.toolbarRight };
    case "rail":
      return { ...arrangement, rail: DEFAULT_ARRANGEMENT.rail };
    case "usageProviders":
      return {
        ...arrangement,
        usageProviders: DEFAULT_ARRANGEMENT.usageProviders,
      };
  }
}
