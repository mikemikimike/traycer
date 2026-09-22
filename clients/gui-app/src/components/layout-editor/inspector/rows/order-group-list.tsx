import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { SortableList } from "@/components/layout-editor/inspector/sortable-list";
import { useLayoutFormHost } from "@/components/layout-editor/inspector/layout-form-host";
import { useSortableRowPadding } from "@/components/layout-editor/inspector/sortable-row-padding";
import { assertNever } from "@/components/layout-editor/inspector/rows/assert-never";
import {
  dividerOrderItem,
  providerOrderItems,
  regionRowItem,
  regionRowItems,
  type SortableRowDecorator,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import {
  ORDER_GROUPS,
  orderGroupInstruction,
  orderGroupListLabel,
} from "@/components/layout-editor/regions/surface-groups";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { railDividerInsertIndex } from "@/lib/layout/rail";
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
  const gutter = useSortableRowPadding();
  return (
    <div className="flex flex-col">
      <OrderGroupRows {...props} />
      {ORDER_GROUPS[group].dividers ? (
        // In the rows' own gutter: it is the last line of the same list, not a
        // button parked under a card (L-25, L-155).
        <div className={gutter.row}>
          <Button
            type="button"
            variant="muted-outline"
            size="xs"
            onClick={() => {
              // Before the LAST panel, never after it (L-159): a divider past
              // the last icon spaces nothing, so an appended one made the
              // press read as a no-op and the user pressed again.
              writeArrangement(
                insertRailDivider(
                  arrangement,
                  railDividerInsertIndex(arrangement.rail),
                ),
              );
            }}
          >
            <Plus />
            Add divider
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The header that introduces one of these lists: its name, how it is operated,
 * and whatever verb belongs to the GROUP rather than to a member (R3-11).
 *
 * Beside {@link OrderGroupList} because it is the other half of the same thing
 * and both hosts compose the pair: the page's surface card draws it above each
 * of its lists with a `Revert order` button, and the dock's Providers level
 * draws it above the one list it has with nothing beside it. It used to be
 * hand-built in both of those files - the same gutter, the same `h3`, the same
 * `max-w-[72ch]` paragraph - which is the drift R1-04 and R2-02 were each about
 * one layer down, with the WORDS already unified into `surface-groups.ts` and
 * only the markup left in two places.
 *
 * What the callers still own is how the header is ruled into the card around
 * it: that is a fact about the card, and the two cards genuinely differ.
 */
export function OrderGroupHeader(props: {
  readonly group: OrderGroupId;
  /** The group's own verb beside the heading, or `null` for none. */
  readonly action: ReactNode;
}): ReactNode {
  const { group, action } = props;
  const facts = ORDER_GROUPS[group];
  const gutter = useSortableRowPadding();
  const page = useLayoutFormHost() === "page";
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-2",
        gutter.row,
      )}
    >
      <div className="min-w-32 flex-1">
        {facts.label === null ? null : (
          <h3 className="font-medium text-foreground">{facts.label}</h3>
        )}
        <p
          className={cn(
            "max-w-[72ch] text-pretty text-muted-foreground",
            // A notch under the row scale the gutter carries, on whichever
            // host: the page reads at the Settings form's size and the dock at
            // the instrument panel's (P-4).
            page ? "text-ui-sm" : "text-ui-xs",
            facts.label === null ? null : "mt-0.5",
          )}
        >
          {orderGroupInstruction(group)}
        </p>
      </div>
      {action}
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
          label={orderGroupListLabel(group)}
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
          label={orderGroupListLabel(group)}
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
          label={orderGroupListLabel(group)}
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
          label={orderGroupListLabel(group)}
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
          label={orderGroupListLabel(group)}
          selectedId={selectedId}
          items={arrangement.rail.map((entry) =>
            entry.kind === "divider"
              ? dividerOrderItem(entry.id, arrangement)
              : regionRowItem(entry.id, values, decorate),
          )}
          // Panels and dividers alike (L-155): the rail is one flat list and
          // a divider is a member of it like any other.
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
