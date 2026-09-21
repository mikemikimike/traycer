import type { ReactNode } from "react";
import {
  SortableList,
  type SortableListItem,
} from "@/components/layout-editor/inspector/sortable-list";
import { assertNever } from "@/components/layout-editor/inspector/rows/assert-never";
import {
  setRegionShown,
  writeArrangement,
} from "@/components/layout-editor/layout-gestures";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  movedWithin,
  moveRailEntry,
  removeRailDivider,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type {
  DockRegionId,
  RegionId,
  ToolbarRegionId,
} from "@/lib/layout/region-id";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * One order group's sortable list, typed in that group's own ids.
 *
 * Written as a branch per group rather than through one `ReadonlyArray<string>`
 * seam: only the rail actually mixes two kinds of id, and widening every group
 * to `string` meant re-narrowing each id back on the way out, where a
 * mis-routed id was silently DROPPED instead of failing (G1-23).
 *
 * Its own module because two rows draw one: the Position row of every movable
 * region, and the Usage limits section's children row.
 */
export function OrderGroupList(props: {
  readonly group: OrderGroupId;
  readonly selectedId: RegionId | null;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly onOpenProvider: ((providerId: RateLimitProviderId) => void) | null;
}): ReactNode {
  const { group, selectedId, values, arrangement, onOpenProvider } = props;
  switch (group) {
    case "dock":
      return (
        <SortableList<DockRegionId>
          selectedId={selectedId}
          items={arrangement.dock.map((id) => regionOrderItem(id, values))}
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
          items={arrangement.toolbarLeft.map((id) =>
            regionOrderItem(id, values),
          )}
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
          items={arrangement.toolbarRight.map((id) =>
            regionOrderItem(id, values),
          )}
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
          items={providerOrderItems(arrangement, onOpenProvider)}
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
              : regionOrderItem(entry.id, values),
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

function regionOrderItem<Id extends RegionId>(
  regionId: Id,
  values: LayoutValues,
): SortableListItem<Id> {
  const facts = regionFacts(regionId);
  return {
    id: regionId,
    label: facts.name,
    icon: facts.icon,
    shown: readControlValue(values[regionId], "shown") !== "hidden",
    onToggleShown: () => {
      setRegionShown(
        regionId,
        readControlValue(values[regionId], "shown") === "hidden",
      );
    },
    onRemove: null,
    onActivate: null,
  };
}

/** A group boundary as a first-class row: draggable, and removable (L-25). */
function dividerOrderItem(
  entryId: string,
  arrangement: LayoutArrangement,
): SortableListItem<string> {
  return {
    id: entryId,
    label: "Divider",
    icon: null,
    shown: null,
    onToggleShown: null,
    onRemove: () => {
      writeArrangement(removeRailDivider(arrangement, entryId));
    },
    onActivate: null,
  };
}

/**
 * The usage providers as list rows, with the second level wired only where
 * there is one to open.
 *
 * One builder for both callers: the `usageProviders` order group and the
 * Usage limits section's own children row draw the SAME list, and writing it
 * twice left the order-group branch unreachable and drifting (G1-13).
 */
function providerOrderItems(
  arrangement: LayoutArrangement,
  onOpenProvider: ((providerId: RateLimitProviderId) => void) | null,
): ReadonlyArray<SortableListItem<RateLimitProviderId>> {
  return arrangement.usageProviders.map((providerId) => ({
    id: providerId,
    label: providerDisplayName(providerId),
    icon: null,
    shown: !arrangement.hiddenProviders.includes(providerId),
    onToggleShown: () => {
      toggleHiddenProvider(providerId, arrangement);
    },
    onRemove: null,
    onActivate:
      onOpenProvider === null
        ? null
        : () => {
            onOpenProvider(providerId);
          },
  }));
}

function toggleHiddenProvider(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
): void {
  writeArrangement({
    ...arrangement,
    hiddenProviders: arrangement.hiddenProviders.includes(providerId)
      ? arrangement.hiddenProviders.filter((entry) => entry !== providerId)
      : [...arrangement.hiddenProviders, providerId],
  });
}
