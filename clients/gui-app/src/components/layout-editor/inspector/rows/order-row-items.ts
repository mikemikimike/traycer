import type { ReactNode } from "react";
import { Gauge } from "lucide-react";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import type { SortableListItem } from "@/components/layout-editor/inspector/sortable-list";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  removeRailDivider,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * What a sortable list's rows are BUILT from, apart from the components that
 * draw them: one row per region, divider or provider, in the order the
 * arrangement holds them.
 *
 * Separate from `order-group-list.tsx` because both hosts build rows and only
 * one of them is that component: the page's surface cards ask for the same
 * items for a list no drag reorders (L-95), and a builder module is also what
 * keeps the three copies of {@link BARE_ROW} down to one.
 */

/**
 * What a HOST adds to a row of one of these lists.
 *
 * The page puts each row's own controls on it, because on that host the row is
 * the whole of the region: its one Shown control, its Size where it has one,
 * its changed dot and revert, and a disclosure that opens Style and Fine-tune
 * in place (L-95, L-89). The dock adds nothing - the section header above the
 * list already owns those for the one region that is selected, and a second
 * copy on the row is exactly the duplicate D5 was about.
 *
 * One seam rather than five props, so a host decorates a row without the list
 * learning what a surface card is.
 */
export interface SortableRowDecoration {
  readonly changed: boolean;
  readonly hint: string | null;
  readonly control: ReactNode;
  readonly detail: ReactNode;
  readonly open: boolean;
  readonly onToggleOpen: (() => void) | null;
}

export type SortableRowDecorator = (id: string) => SortableRowDecoration;

/**
 * An undecorated row: what a host that decorates nothing leaves behind.
 *
 * Every builder below spreads the decoration FIRST and sets its own fields
 * after it (R1-21). The two key sets are disjoint today, so the order is
 * invisible - which is the point: a field added to
 * {@link SortableRowDecoration} that happens to share a builder's name would
 * otherwise overwrite what the builder had just decided, silently.
 */
export const BARE_ROW: SortableRowDecoration = {
  changed: false,
  hint: null,
  control: null,
  detail: null,
  open: false,
  onToggleOpen: null,
};

/**
 * Regions as rows, for a caller that has a list of them rather than an order
 * group - the Top bar, Chat and Status bar cards, whose regions sit in no list
 * a drag can reorder but are still rows of the same shape (L-95).
 */
export function regionRowItems<Id extends RegionId>(
  regionIds: ReadonlyArray<Id>,
  values: LayoutValues,
  decorate: SortableRowDecorator | null,
): ReadonlyArray<SortableListItem<Id>> {
  return regionIds.map((regionId) => regionRowItem(regionId, values, decorate));
}

export function regionRowItem<Id extends RegionId>(
  regionId: Id,
  values: LayoutValues,
  decorate: SortableRowDecorator | null,
): SortableListItem<Id> {
  const facts = regionFacts(regionId);
  return {
    ...(decorate === null ? BARE_ROW : decorate(regionId)),
    id: regionId,
    label: facts.name,
    icon: facts.icon,
    divider: false,
    dimmed: readControlValue(values[regionId], "shown") === "hidden",
    onRemove: null,
    onActivate: null,
  };
}

/** A group boundary as a first-class row: draggable, and removable (L-25). */
export function dividerOrderItem(
  entryId: string,
  arrangement: LayoutArrangement,
): SortableListItem<string> {
  return {
    ...BARE_ROW,
    id: entryId,
    label: "Divider",
    icon: null,
    divider: true,
    dimmed: false,
    onRemove: () => {
      writeArrangement(removeRailDivider(arrangement, entryId));
    },
    onActivate: null,
  };
}

/**
 * The usage providers as list rows, with the second level wired the way this
 * host opens one: as its own screen in the dock, and as the row's own
 * disclosure on the page (L-89, D6).
 *
 * One builder for both callers: the `usageProviders` order group and the
 * Usage limits section's own children row draw the SAME list, and writing it
 * twice left the order-group branch unreachable and drifting (G1-13).
 */
export function providerOrderItems(
  arrangement: LayoutArrangement,
  onOpenProvider: ((providerId: RateLimitProviderId) => void) | null,
  decorate: SortableRowDecorator | null,
): ReadonlyArray<SortableListItem<RateLimitProviderId>> {
  return arrangement.usageProviders.map((providerId) => ({
    ...(decorate === null ? BARE_ROW : decorate(providerId)),
    id: providerId,
    label: providerDisplayName(providerId),
    // The usage cluster's own glyph, so a provider row reads like every other
    // sortable row rather than as bare text beside them (I-12). One icon for
    // the whole list: a provider is a reading, and the list is of readings.
    icon: Gauge,
    divider: false,
    dimmed: arrangement.hiddenProviders.includes(providerId),
    onRemove: null,
    onActivate:
      onOpenProvider === null
        ? null
        : () => {
            onOpenProvider(providerId);
          },
  }));
}
