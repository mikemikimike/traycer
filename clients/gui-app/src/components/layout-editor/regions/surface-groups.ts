import { LAYOUT_REGION_LIST } from "@/components/layout-editor/regions/region-facts";
import { regionMatchesFilter } from "@/components/layout-editor/regions/region-filter-match";
import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import type { OrderGroupId } from "@/lib/layout/layout-arrangement";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The tier above the region registry: what a SURFACE owns (L-92, L-95).
 *
 * The inspector can filter, because something is selected. The full-width page
 * cannot, so it has to group - and the organising unit there is the surface,
 * with the region as a ROW inside it. That single move deletes every repeat the
 * owner found: a shared group control has exactly one place to live once the
 * group itself is the section.
 *
 * So the facts that belong to a LIST rather than to any one member live here
 * and not in `regions/*`: the reorder instruction the nine rail regions used to
 * carry nine copies of, the "here or on the canvas" line the composer's eight
 * carried eight, and the pinned-right note that the Model region alone happened
 * to state for the whole right cluster (D1-D4, D8). The docked inspector reads
 * the same table, so neither host owns a second copy of the words.
 */

export interface OrderGroupFacts {
  /**
   * The heading above the list, or `null` where the surface card's own name
   * already says it - the sidebar has one list and it is the sidebar.
   */
  readonly label: string | null;
  /** How this list is operated, said once by the list (D8). */
  readonly description: string;
  /** A rule about the whole group, said by the group rather than by a member. */
  readonly note: string | null;
  /** Whether this group's boundaries are items of its own (L-25): the rail. */
  readonly dividers: boolean;
}

export const ORDER_GROUPS: Readonly<Record<OrderGroupId, OrderGroupFacts>> = {
  dock: {
    label: "Above the message box",
    description: "Drag to reorder, here or on the canvas.",
    note: null,
    dividers: false,
  },
  toolbarLeft: {
    label: "Toolbar, left",
    description: "Drag to reorder, here or on the canvas.",
    note: null,
    dividers: false,
  },
  toolbarRight: {
    label: "Toolbar, right",
    description: "Drag to reorder, here or on the canvas.",
    // Said by the cluster the rule is about. It used to be drawn by the Model
    // region's own Position row, which meant the Microphone's copy of the same
    // list silently omitted it (D4).
    note: "The model chip stays on the right.",
    dividers: false,
  },
  rail: {
    label: null,
    description: "Drag to reorder. Dividers are items too.",
    note: null,
    dividers: true,
  },
  usageProviders: {
    label: "Providers",
    description: "Drag to reorder. Open one for its limits.",
    note: null,
    dividers: false,
  },
};

/**
 * The order lists a surface draws, in reading order.
 *
 * `usageProviders` belongs to no surface: it is a list INSIDE Usage limits, so
 * it is drawn by that region's own children row in either host.
 */
export const SURFACE_ORDER_GROUPS: Readonly<
  Record<SurfaceGroupId, ReadonlyArray<OrderGroupId>>
> = {
  topBar: [],
  sidebar: ["rail"],
  chat: [],
  composer: ["dock", "toolbarLeft", "toolbarRight"],
  statusBar: [],
};

/**
 * One surface's regions that sit in no order list - the rows a surface card
 * draws directly, above or beside its lists.
 *
 * Derived rather than listed: a region joins a list by declaring a
 * `position-order` row, and a second hand-written list here could only drift
 * from that one.
 */
export function looseSurfaceRegions(
  surface: SurfaceGroupId,
): ReadonlyArray<RegionId> {
  return LAYOUT_REGION_LIST.filter(
    (region) =>
      region.surface === surface &&
      !region.rows.some((row) => row.kind === "position-order"),
  ).map((region) => region.id);
}

/**
 * Whether a surface has anything left to draw under the page's filter.
 *
 * Asked by the page so a card with no match disappears whole rather than
 * leaving an empty box behind (I-11).
 */
export function surfaceMatchesFilter(
  surface: SurfaceGroupId,
  filter: string,
): boolean {
  return LAYOUT_REGION_LIST.some(
    (region) =>
      region.surface === surface && regionMatchesFilter(region.id, filter),
  );
}

/**
 * Whether this surface opens with a picture, which is what tells the card
 * whether its first block of rows has anything above it to be separated from.
 *
 * Chat is the one surface `SurfaceSpecimen` draws nothing for: its two regions
 * live on two different surfaces - the minimap on the transcript's edge and
 * the context chip on the composer's foot - so there is no single row that
 * holds both, and P-2 says to omit a specimen rather than approximate one.
 */
export function surfaceHasSpecimen(surface: SurfaceGroupId): boolean {
  return surface !== "chat";
}
