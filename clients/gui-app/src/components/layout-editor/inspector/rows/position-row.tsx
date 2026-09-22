import type { ReactNode } from "react";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import {
  BarHostControl,
  RegionSideControl,
} from "@/components/layout-editor/inspector/region-controls";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import { orderGroupInstruction } from "@/components/layout-editor/regions/surface-groups";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import {
  positionAxisChanged,
  revertPositionAxis,
  positionRowChanged,
  revertPositionRow,
} from "@/components/layout-editor/regions/region-position-rows";
import {
  asBarRegionId,
  type LayoutArrangement,
  type OrderGroupId,
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
 * A revert belongs to the ROW it sits on, and since L-156 the two bar readings
 * have two of them - a bar and an end of it - so each puts its own axis back
 * and leaves the other alone. The order row still reverts its whole group,
 * which is what putting a list back means.
 */

/**
 * Which of the two bars a reading lives in: the usage cluster and the resource
 * monitor, each answering for itself (L-156).
 *
 * Only a bar region has this row, so a region id that is not one draws no
 * control rather than a control writing somewhere else.
 */
export function PositionHostRow(props: {
  readonly regionId: RegionId;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly description: string;
}): ReactNode {
  const { regionId, arrangement, snapshot, description } = props;
  const barRegion = asBarRegionId(regionId);
  if (barRegion === null) return null;
  return (
    <InspectorRow
      label="Position"
      description={description}
      onRevert={
        positionAxisChanged(snapshot, regionId, "position-host")
          ? () => {
              writeArrangement(
                revertPositionAxis(arrangement, regionId, "position-host"),
              );
            }
          : undefined
      }
      control={
        <BarHostControl regionId={barRegion} arrangement={arrangement} />
      }
    />
  );
}

/**
 * Which end of its surface an edge-anchored region sits at.
 *
 * "Side" wherever the region also picks a bar, because two rows both labelled
 * Position say nothing about which is which; "Position" on its own where the
 * side IS the whole question, which is the minimap's row.
 */
export function PositionSideRow(props: {
  readonly regionId: RegionId;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly description: string;
}): ReactNode {
  const { regionId, arrangement, snapshot, description } = props;
  return (
    <InspectorRow
      label={sideRowLabel(regionId)}
      description={description}
      onRevert={
        positionAxisChanged(snapshot, regionId, "position-side")
          ? () => {
              writeArrangement(
                revertPositionAxis(arrangement, regionId, "position-side"),
              );
            }
          : undefined
      }
      control={
        <RegionSideControl regionId={regionId} arrangement={arrangement} />
      }
    />
  );
}

/** What the side row is called beside the rows the same region draws. */
function sideRowLabel(regionId: RegionId): string {
  return regionFacts(regionId).rows.some((row) => row.kind === "position-host")
    ? "Side"
    : "Position";
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
