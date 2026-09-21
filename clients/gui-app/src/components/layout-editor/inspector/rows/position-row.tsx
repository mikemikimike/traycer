import type { ReactNode } from "react";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import {
  RegionSideControl,
  UsageHostControl,
} from "@/components/layout-editor/inspector/region-controls";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import { orderGroupInstruction } from "@/components/layout-editor/regions/surface-groups";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import {
  positionRowChanged,
  revertPositionRow,
} from "@/components/layout-editor/regions/region-position-rows";
import type {
  LayoutArrangement,
  OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * Where a region sits, in the three shapes that question has: which surface
 * hosts it, which end of a surface it is anchored to, and where it falls in a
 * list a drag can reorder.
 *
 * These are the DOCK's framing of those three controls (`region-controls.tsx`).
 * The page has no Position row at all: a region's place IS its place in its
 * surface card's list, its side sits inline on the row, and the usage cluster's
 * host belongs to the Status bar surface rather than to a region (L-95, D7).
 *
 * All three revert together through `revertPositionRow`, because a region has
 * at most one Position row and the revert button belongs to the row rather
 * than to the field behind it (L-57).
 */

/** The one region whose surface is itself a setting: the usage cluster. */
export function PositionHostRow(props: {
  readonly regionId: RegionId;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly description: string;
}): ReactNode {
  const { regionId, arrangement, snapshot, description } = props;
  return (
    <InspectorRow
      label="Position"
      description={description}
      onRevert={
        positionRowChanged(snapshot, regionId)
          ? () => {
              writeArrangement(revertPositionRow(arrangement, regionId));
            }
          : undefined
      }
      control={<UsageHostControl arrangement={arrangement} />}
    />
  );
}

/** Which end of its surface an edge-anchored region sits at. */
export function PositionSideRow(props: {
  readonly regionId: RegionId;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly description: string;
}): ReactNode {
  const { regionId, arrangement, snapshot, description } = props;
  return (
    <InspectorRow
      label="Position"
      description={description}
      onRevert={
        positionRowChanged(snapshot, regionId)
          ? () => {
              writeArrangement(revertPositionRow(arrangement, regionId));
            }
          : undefined
      }
      control={
        <RegionSideControl regionId={regionId} arrangement={arrangement} />
      }
    />
  );
}

/**
 * A region's place in one of the five lists a drag can reorder - the same list
 * the page draws on its surface card, filtered to nothing and highlighted on
 * this region's row instead (L-03).
 */
export function PositionOrderRow(props: {
  readonly regionId: RegionId;
  readonly group: OrderGroupId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  const { regionId, group, values, arrangement, snapshot } = props;
  return (
    <InspectorRow
      stacked
      label="Position"
      description={orderGroupInstruction(group)}
      onRevert={
        positionRowChanged(snapshot, regionId)
          ? () => {
              writeArrangement(revertPositionRow(arrangement, regionId));
            }
          : undefined
      }
      control={
        <OrderGroupList
          group={group}
          selectedId={regionId}
          values={values}
          arrangement={arrangement}
          onOpenProvider={null}
          decorate={null}
        />
      }
    />
  );
}
