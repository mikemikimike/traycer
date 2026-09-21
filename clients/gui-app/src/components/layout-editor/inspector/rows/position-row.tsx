import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import {
  EDGE_SIDE_OPTIONS,
  USAGE_HOST_OPTIONS,
} from "@/components/layout-editor/regions/region-grammar";
import {
  positionRowChanged,
  revertPositionRow,
} from "@/components/layout-editor/regions/region-position-rows";
import {
  insertRailDivider,
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
      control={
        <SegmentedControl
          ariaLabel="Position"
          options={USAGE_HOST_OPTIONS}
          value={arrangement.usageHost}
          onChange={(next) => {
            if (next !== "status-bar" && next !== "header") return;
            writeArrangement({ ...arrangement, usageHost: next });
          }}
        />
      }
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
  const sideKey = regionId === "minimap" ? "minimapSide" : "resourceSide";
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
        <SegmentedControl
          ariaLabel="Position"
          options={EDGE_SIDE_OPTIONS}
          value={arrangement[sideKey]}
          onChange={(next) => {
            if (next !== "left" && next !== "right") return;
            writeArrangement({ ...arrangement, [sideKey]: next });
          }}
        />
      }
    />
  );
}

/** A region's place in one of the five lists a drag can reorder. */
export function PositionOrderRow(props: {
  readonly regionId: RegionId;
  readonly group: OrderGroupId;
  readonly description: string;
  readonly pinnedRight: boolean;
  /** Whether this group's boundaries are items of its own (L-25): the rail. */
  readonly dividers: boolean;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  const {
    regionId,
    group,
    description,
    pinnedRight,
    dividers,
    values,
    arrangement,
    snapshot,
  } = props;

  return (
    <InspectorRow
      stacked
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
        <div className="flex flex-col gap-2">
          <OrderGroupList
            group={group}
            selectedId={regionId}
            values={values}
            arrangement={arrangement}
            onOpenProvider={null}
          />
          {dividers ? (
            <Button
              type="button"
              variant="muted-outline"
              size="xs"
              className="self-start"
              onClick={() => {
                // Appended, so a new boundary never lands in the middle of a
                // grouping the user has already made; dragging it up is the
                // gesture that places it (L-25).
                writeArrangement(
                  insertRailDivider(arrangement, arrangement.rail.length),
                );
              }}
            >
              <Plus />
              Add divider
            </Button>
          ) : null}
          {pinnedRight ? (
            <p className="text-ui-xs text-muted-foreground">
              The model chip stays on the right.
            </p>
          ) : null}
        </div>
      }
    />
  );
}
