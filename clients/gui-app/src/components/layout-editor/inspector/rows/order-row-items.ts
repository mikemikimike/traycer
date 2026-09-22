import type { ReactNode } from "react";
import { Gauge, Rows2 } from "lucide-react";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import type { SortableListItem } from "@/components/layout-editor/inspector/sortable-list";
import { writeArrangement } from "@/lib/layout/arrangement-gestures";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  isStackedRailPanel,
  removeRailDivider,
  stackRailPanels,
  unstackRail,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { leftPanelIdForRailRegion, type RailEntry } from "@/lib/layout/rail";
import { expandJoinedPanelSections } from "@/stores/epics/left-panel-store";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
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
  /**
   * The real component as the row's glyph (L-120), or `null` for the
   * registry's icon. Supplied by the HOST because it is the host that decides
   * a list is the picture: the page's Sidebar card draws the rail's own
   * buttons, and nothing else does.
   */
  readonly glyph: ReactNode;
  /** The row's ONE state control (L-121). */
  readonly control: ReactNode;
  /** The row's revert, for the slot the row reserves for it (L-122). */
  readonly revert: ReactNode;
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
  glyph: null,
  control: null,
  revert: null,
  detail: null,
  open: false,
  onToggleOpen: null,
};

/** What every builder below sets unless it has a reason not to. */
const PLAIN_ROW = {
  divider: false,
  movable: true,
  onRemove: null,
  removeLabel: null,
  onStack: null,
  onActivate: null,
} as const;

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
    ...PLAIN_ROW,
    id: regionId,
    label: facts.name,
    icon: facts.icon,
    dimmed: readControlValue(values[regionId], "shown") === "hidden",
  };
}

/**
 * A rail PANEL as a row, with the one verb a rail row has that no other list's
 * row does: joining it to the panel below (L-168).
 *
 * The panel BELOW is handed to `stackRailPanels` as the SOURCE, not this row's
 * own panel (L-170). The writer moves its source under its target, so passing
 * this row's panel would slide the panel the user pressed underneath the one
 * the button promised to keep it above. With the arguments this way round the
 * source is already directly below the target, so the join moves nothing: the
 * panel order before and after the press is identical, which is the same
 * promise the link row's Remove makes.
 *
 * Offered only where it can be taken - the entry below is a panel rather than
 * a divider, and neither of the two is already half of a pair - because a
 * stack joins exactly two adjacent panels (L-166) and a button that refuses
 * every press is worse than no button.
 */
export function railPanelOrderItem(
  regionId: RailRegionId,
  arrangement: LayoutArrangement,
  values: LayoutValues,
  decorate: SortableRowDecorator | null,
): SortableListItem<string> {
  const row = regionRowItem<RegionId>(regionId, values, decorate);
  const below = railPanelBelow(arrangement.rail, regionId);
  const stackable =
    below !== null &&
    !isStackedRailPanel(arrangement.rail, regionId) &&
    !isStackedRailPanel(arrangement.rail, below);
  return {
    ...row,
    onStack:
      below === null || !stackable
        ? null
        : () => {
            const top = leftPanelIdForRailRegion(regionId);
            const bottom = leftPanelIdForRailRegion(below);
            writeArrangement(stackRailPanels(arrangement, bottom, top));
            // A new stack opens with both sections showing (L-170): a flag
            // left over from a pair the user took apart has had no control
            // that could clear it since, so it must not come back with the
            // join.
            expandJoinedPanelSections(top, bottom);
          },
  };
}

/** The panel immediately below this one, or `null` for anything else. */
function railPanelBelow(
  rail: ReadonlyArray<RailEntry>,
  regionId: RailRegionId,
): RailRegionId | null {
  const index = rail.findIndex(
    (entry) => entry.kind === "panel" && entry.id === regionId,
  );
  if (index < 0) return null;
  const below = rail.at(index + 1);
  return below !== undefined && below.kind === "panel" ? below.id : null;
}

/**
 * A stack link as a first-class row: the join between the two panels it sits
 * between, removable exactly as a divider is (L-168).
 *
 * Not draggable, which is the one way it differs from a divider row: the link
 * is not a member the user places, so it moves when its panels do and the row
 * offers no gesture that would write nothing.
 */
export function stackOrderItem(
  entryId: string,
  arrangement: LayoutArrangement,
): SortableListItem<string> {
  return {
    ...BARE_ROW,
    ...PLAIN_ROW,
    id: entryId,
    label: "Stacked with the panel below",
    icon: Rows2,
    movable: false,
    dimmed: false,
    onRemove: () => {
      writeArrangement(unstackRail(arrangement, entryId));
    },
    removeLabel: "Remove stack",
  };
}

/**
 * A divider as a first-class row: draggable, and removable (L-155).
 *
 * "Divider" is the only name the user ever sees for it, and the row's Remove
 * button takes its accessible name from this label.
 */
export function dividerOrderItem(
  entryId: string,
  arrangement: LayoutArrangement,
): SortableListItem<string> {
  return {
    ...BARE_ROW,
    ...PLAIN_ROW,
    id: entryId,
    label: "Divider",
    icon: null,
    divider: true,
    dimmed: false,
    onRemove: () => {
      writeArrangement(removeRailDivider(arrangement, entryId));
    },
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
    ...PLAIN_ROW,
    id: providerId,
    label: providerDisplayName(providerId),
    // The usage cluster's own glyph, so a provider row reads like every other
    // sortable row rather than as bare text beside them (I-12). One icon for
    // the whole list: a provider is a reading, and the list is of readings.
    icon: Gauge,
    dimmed: arrangement.hiddenProviders.includes(providerId),
    onActivate:
      onOpenProvider === null
        ? null
        : () => {
            onOpenProvider(providerId);
          },
  }));
}
