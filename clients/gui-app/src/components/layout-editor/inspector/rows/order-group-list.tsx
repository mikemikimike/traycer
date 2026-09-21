import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { SortableList } from "@/components/layout-editor/inspector/sortable-list";
import { assertNever } from "@/components/layout-editor/inspector/rows/assert-never";
import {
  dividerOrderItem,
  providerOrderItems,
  regionRowItem,
  regionRowItems,
  type SortableRowDecorator,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import { ORDER_GROUPS } from "@/components/layout-editor/regions/surface-groups";
import { Button } from "@/components/ui/button";
import {
  insertRailDivider,
  movedWithin,
  moveRailEntry,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type {
  DockRegionId,
  RegionId,
  ToolbarRegionId,
} from "@/lib/layout/region-id";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * One order group's sortable list, typed in that group's own ids.
 *
 * Written as a branch per group rather than through one `ReadonlyArray<string>`
 * seam: only the rail actually mixes two kinds of id, and widening every group
 * to `string` meant re-narrowing each id back on the way out, where a
 * mis-routed id was silently DROPPED instead of failing (G1-23).
 *
 * THE list for its group, in both hosts (L-03, L-95). The page draws it once
 * per surface card with `selectedId: null`, and the inspector draws the same
 * one for the selected region with `selectedId` on its row - which is the whole
 * of what the two hosts need to differ by, and why nine rail sections could
 * collapse into one list without a page-only component.
 */
export function OrderGroupList(props: {
  readonly group: OrderGroupId;
  readonly selectedId: RegionId | null;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly onOpenProvider: ((providerId: RateLimitProviderId) => void) | null;
  readonly decorate: SortableRowDecorator | null;
}): ReactNode {
  const { group, arrangement } = props;
  return (
    <div className="flex flex-col gap-2">
      <OrderGroupRows {...props} />
      {ORDER_GROUPS[group].dividers ? (
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
      {ORDER_GROUPS[group].note === null ? null : (
        <p className="text-ui-xs text-muted-foreground">
          {ORDER_GROUPS[group].note}
        </p>
      )}
    </div>
  );
}

function OrderGroupRows(props: {
  readonly group: OrderGroupId;
  readonly selectedId: RegionId | null;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly onOpenProvider: ((providerId: RateLimitProviderId) => void) | null;
  readonly decorate: SortableRowDecorator | null;
}): ReactNode {
  const { group, selectedId, values, arrangement, onOpenProvider, decorate } =
    props;
  switch (group) {
    case "dock":
      return (
        <SortableList<DockRegionId>
          selectedId={selectedId}
          items={regionRowItems(arrangement.dock, values, decorate)}
          onMove={(id, toIndex) => {
            writeArrangement({
              ...arrangement,
              dock: movedById(arrangement.dock, id, toIndex),
            });
          }}
        />
      );
    case "toolbarLeft":
      return (
        <SortableList<ToolbarRegionId>
          selectedId={selectedId}
          items={regionRowItems(arrangement.toolbarLeft, values, decorate)}
          onMove={(id, toIndex) => {
            writeArrangement({
              ...arrangement,
              toolbarLeft: movedById(arrangement.toolbarLeft, id, toIndex),
            });
          }}
        />
      );
    case "toolbarRight":
      return (
        <SortableList<ToolbarRegionId>
          selectedId={selectedId}
          items={regionRowItems(arrangement.toolbarRight, values, decorate)}
          onMove={(id, toIndex) => {
            writeArrangement({
              ...arrangement,
              toolbarRight: movedById(arrangement.toolbarRight, id, toIndex),
            });
          }}
        />
      );
    case "usageProviders":
      return (
        <SortableList<RateLimitProviderId>
          selectedId={selectedId}
          items={providerOrderItems(arrangement, onOpenProvider, decorate)}
          onMove={(id, toIndex) => {
            writeArrangement({
              ...arrangement,
              usageProviders: movedById(
                arrangement.usageProviders,
                id,
                toIndex,
              ),
            });
          }}
        />
      );
    case "rail":
      return (
        <SortableList<string>
          selectedId={selectedId}
          items={arrangement.rail.map((entry) =>
            entry.kind === "divider"
              ? dividerOrderItem(entry.id, arrangement)
              : regionRowItem(entry.id, values, decorate),
          )}
          // Panels and dividers alike, which is the whole of L-25: dragging a
          // divider is what splits and merges groups, and dragging a panel
          // past one is what changes which group it is in.
          onMove={(id, toIndex) => {
            writeArrangement(moveRailEntry(arrangement, id, toIndex));
          }}
        />
      );
    default:
      return assertNever(group);
  }
}

/** One id's new index, with an id this list no longer holds left alone. */
function movedById<Id extends string>(
  list: ReadonlyArray<Id>,
  id: Id,
  toIndex: number,
): ReadonlyArray<Id> {
  const fromIndex = list.indexOf(id);
  return fromIndex < 0 ? list : movedWithin(list, fromIndex, toIndex);
}
