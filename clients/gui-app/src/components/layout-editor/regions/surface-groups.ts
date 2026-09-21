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
    label: "Toolbar left",
    description: "Drag to reorder, here or on the canvas.",
    note: null,
    dividers: false,
  },
  toolbarRight: {
    label: "Toolbar right",
    description: "Drag to reorder, here or on the canvas.",
    // Said by the cluster the rule is about. It used to be drawn by the Model
    // region's own Position row, which meant the Microphone's copy of the same
    // list silently omitted it (D4).
    note: "The model chip stays on the right.",
    dividers: false,
  },
  rail: {
    label: null,
    // The rail's icons are canvas-draggable too now (L-115), so its line says
    // what the other three canvas groups' lines say.
    description:
      "Drag to reorder, here or on the canvas. Group breaks are items too.",
    note: null,
    dividers: true,
  },
  usageProviders: {
    label: "Providers",
    description: "Drag to reorder. Open one to choose which limits it draws.",
    note: null,
    dividers: false,
  },
};

/**
 * The order lists a surface draws, in reading order.
 *
 * `usageProviders` is a list of PROVIDERS rather than of regions, and it used
 * to hang three levels down inside the Usage limits row's disclosure. It is a
 * headed list in the Status bar card now (L-123), a sibling of the two region
 * rows, which is what took the depth from five levels to two. The docked
 * inspector still opens it from the Usage limits section, where a selection is
 * what there is.
 */
export const SURFACE_ORDER_GROUPS: Readonly<
  Record<SurfaceGroupId, ReadonlyArray<OrderGroupId>>
> = {
  topBar: [],
  sidebar: ["rail"],
  chat: [],
  composer: ["dock", "toolbarLeft", "toolbarRight"],
  statusBar: ["usageProviders"],
};

/**
 * The label a screen reader hears for one of these lists.
 *
 * The rail's group has none of its own, because on the page the card it sits
 * in is already headed "Sidebar" - which a row's own context does not carry,
 * so the group says it here.
 */
export function orderGroupListLabel(group: OrderGroupId): string {
  return ORDER_GROUPS[group].label ?? "Sidebar panels";
}

/**
 * How a list is operated AND whatever rule holds for the whole of it, as one
 * line for the header that introduces it.
 *
 * The note used to be drawn under the list, where it read as a footnote to the
 * card rather than as a rule about the list (redesign 4.8). It is the list
 * header's business in both hosts now - the page's card header and the dock's
 * Position row - so it is joined here rather than in either of them.
 */
export function orderGroupInstruction(group: OrderGroupId): string {
  const facts = ORDER_GROUPS[group];
  return facts.note === null
    ? facts.description
    : `${facts.description} ${facts.note}`;
}

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
 * The two surfaces the page draws a picture of, and the only two (L-120,
 * redesign 3.2).
 *
 * The rule: a surface gets a picture only where the picture carries something
 * its rows cannot, and the picture is placed on the axis the surface runs on.
 *
 * - **Composer.** `Full row / Chip / Hidden` across three lists, the
 *   pills-vs-joined-frame split and the two toolbar clusters are not derivable
 *   from three lists of names. It runs horizontally, so a band above it is the
 *   right axis.
 * - **Status bar.** `usageHost` and `resourceSide` are facts about the strip,
 *   and the strip is the only thing that can show them.
 *
 * The other three draw none. The **Sidebar**'s assembled shape IS its list
 * order, and each row already carries the real rail button as its glyph
 * (L-120) - the one fact a plinth added is the fact the list is made of. The
 * **Top bar** is one region, so a picture of it is a mystery empty box. **Chat**
 * has two regions on two different surfaces, so there is no single row that
 * holds both and P-2 says to omit rather than approximate.
 */
const SURFACE_BANDS: ReadonlyArray<SurfaceGroupId> = ["composer", "statusBar"];

/**
 * Whether this surface opens with a picture band, which is also what tells the
 * card whether its first block of rows has anything above it to be ruled off
 * from.
 */
export function surfaceHasBand(surface: SurfaceGroupId): boolean {
  return SURFACE_BANDS.includes(surface);
}
