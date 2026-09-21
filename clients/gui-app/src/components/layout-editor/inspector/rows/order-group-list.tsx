import type { ReactNode } from "react";
import {
  SortableList,
  type SortableListItem,
} from "@/components/layout-editor/inspector/sortable-list";
import { assertNever } from "@/components/layout-editor/inspector/rows/assert-never";
import {
  setRegionShown,
  writeArrangement,
} from "@/components/layout-editor/inspector/rows/region-section-writes";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import type {
  LayoutArrangement,
  OrderGroupId,
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
          onReorder={(dock) => {
            writeArrangement({ ...arrangement, dock });
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
          onReorder={(toolbarLeft) => {
            writeArrangement({ ...arrangement, toolbarLeft });
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
          onReorder={(toolbarRight) => {
            writeArrangement({ ...arrangement, toolbarRight });
          }}
        />
      );
    case "usageProviders":
      return (
        <SortableList<RateLimitProviderId>
          selectedId={selectedId}
          items={providerOrderItems(arrangement, onOpenProvider)}
          onReorder={(usageProviders) => {
            writeArrangement({ ...arrangement, usageProviders });
          }}
        />
      );
    case "rail":
      return (
        <SortableList<string>
          selectedId={selectedId}
          items={arrangement.rail.map((entry) =>
            entry.kind === "divider"
              ? {
                  id: entry.id,
                  label: "Divider",
                  icon: null,
                  shown: null,
                  onToggleShown: null,
                  onActivate: null,
                }
              : regionOrderItem(entry.id, values),
          )}
          onReorder={(ids) => {
            // One lookup table rather than a `find` per id: ticket 09 drives
            // this from a drag, where the list is walked every frame.
            const byId = new Map(arrangement.rail.map((e) => [e.id, e]));
            writeArrangement({
              ...arrangement,
              rail: ids.flatMap((id) => {
                const entry = byId.get(id);
                return entry === undefined ? [] : [entry];
              }),
            });
          }}
        />
      );
    default:
      return assertNever(group);
  }
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
