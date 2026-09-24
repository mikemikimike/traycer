import type { LucideIcon } from "lucide-react";
import type {
  LayoutArrangement,
  OrderGroupId,
  BarHost,
  SideStripView,
  TabStripPlacement,
} from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The grammar every region's section is written in (L-08), and the few row
 * shapes and option sets more than one surface reuses.
 *
 * A section is not written per region anywhere: a region declares its rows in
 * the fixed grammar order and one renderer draws them, which is what keeps the
 * docked inspector and the full-width `Settings > Layout` host the same form
 * (L-03). Every row is generic over the region id, so a row naming a key the
 * region does not have is a compile error rather than a runtime test (C-20).
 *
 * The regions themselves are the five per-surface tables beside this file; the
 * index that joins them is `layout-regions.ts`.
 */

export type SurfaceGroupId =
  | "topBar"
  | "sidebar"
  | "chat"
  | "composer"
  | "statusBar";

/** The index's groups, in the order a reader meets them top to bottom. */
export const SURFACE_GROUPS: ReadonlyArray<{
  readonly id: SurfaceGroupId;
  readonly label: string;
}> = [
  { id: "topBar", label: "Tabs" },
  { id: "sidebar", label: "Sidebar" },
  { id: "chat", label: "Chat" },
  { id: "composer", label: "Composer" },
  { id: "statusBar", label: "Status bar" },
];

/**
 * What a right-click on a customizable element offers (L-19).
 *
 * `hide` and `show` are one pair rather than one verb because the menu names
 * the region ("Hide Minimap"), so which of the two is offered is a question
 * about the region's current state, not about which verbs it has.
 */
export type QuickVerbId = "hide" | "show" | "chip" | "full";

export type LayoutRegionIcon = LucideIcon;

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
}

/**
 * How one fine-tune row is operated.
 *
 * `switch` is a two-state key, which is a `boolean` on most regions and a
 * `Visibility` on the two that spell it out; the renderer reads the region's
 * own value type. `checks` is one boolean key per option, paired by position,
 * so `options[i].value` is `keys[i]`. `field-checks` is the other shape a check
 * list has: ONE key holding the list of what is checked, which is also the list
 * a drag reorders.
 */
export type ControlSpec<K extends RegionId> =
  | { readonly kind: "switch"; readonly key: keyof LayoutValues[K] & string }
  | {
      readonly kind: "segment";
      readonly key: keyof LayoutValues[K] & string;
      readonly options: ReadonlyArray<SegmentOption>;
    }
  | {
      readonly kind: "checks";
      readonly keys: ReadonlyArray<keyof LayoutValues[K] & string>;
      readonly options: ReadonlyArray<SegmentOption>;
    }
  | {
      readonly kind: "field-checks";
      readonly key: keyof LayoutValues[K] & string;
      readonly options: ReadonlyArray<SegmentOption>;
    };

export interface FineTuneRow<K extends RegionId> {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  /**
   * Whether an active row opens the real transient surface this setting is
   * about, pinned and inert on the canvas (L-27) - the only way to see a
   * change that lands inside a popover or a hover card. The section renderer
   * owns the pinning; this is what tells it which row asks for one.
   */
  readonly pinsTransient: boolean;
  /**
   * Whether the row stays operable while its region is Hidden. A fine-tune row
   * normally tunes the region itself, so a hidden region greys it; the one
   * exception is a setting about ANOTHER surface that only lives here beside
   * its sibling (the agent rows' resource readings, G7).
   */
  readonly whileHidden: boolean;
  readonly control: ControlSpec<K>;
}

export interface StyleExample<K extends RegionId> {
  readonly id: string;
  readonly label: string;
  readonly patch: Partial<LayoutValues[K]>;
}

/**
 * What ONE Style example draws (L-10).
 *
 * `region` is the region itself, which is one element for every region that
 * has a Style block but one. The usage cluster repeats a segment per shown
 * provider, so drawing the region there asked a 260px example row for eight
 * segments and clipped it after two (I-06); `usage-provider` is the specimen
 * the prototype picks instead - a single provider's segment, which is what
 * the reading actually looks like.
 */
export type StyleSpecimen = "region" | "usage-provider";

export type GrammarRow<K extends RegionId> =
  | { readonly kind: "size"; readonly description: string }
  | { readonly kind: "position-host"; readonly description: string }
  | { readonly kind: "position-side"; readonly description: string }
  // Names its group and nothing else: how the list is operated, whether its
  // boundaries are items and what is pinned inside it are facts about the
  // GROUP, and they live once in `surface-groups.ts` rather than once per
  // member (D1-D4, D8).
  | { readonly kind: "position-order"; readonly group: OrderGroupId }
  | {
      readonly kind: "style";
      readonly description: string | null;
      readonly specimen: StyleSpecimen;
      readonly examples: ReadonlyArray<StyleExample<K>>;
    }
  | { readonly kind: "fine-tune"; readonly rows: ReadonlyArray<FineTuneRow<K>> }
  | { readonly kind: "children"; readonly level: "usage-providers" };

export interface LayoutRegion<K extends RegionId> {
  readonly id: K;
  readonly name: string;
  readonly surface: SurfaceGroupId;
  readonly icon: LayoutRegionIcon;
  readonly where: string;
  /**
   * The BAR each of the two movable readings names, one sentence per bar
   * (L-156). The side is the other half of their position and comes from the
   * arrangement, so it is composed in `regionWhere` rather than written into
   * four sentences here. `null` for a region that lives where it lives.
   */
  readonly whereByHost: Readonly<Record<BarHost, string>> | null;
  /**
   * The presence rule a region follows when nobody has chosen for it (L-47),
   * spelled out in its row. `null` means the region has no rule, which is also
   * what makes its Shown control a plain switch rather than the tri-state one.
   */
  readonly hint: string | null;
  readonly keywords: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<GrammarRow<K>>;
  readonly quickVerbs: ReadonlyArray<QuickVerbId>;
  readonly stateWord: (
    values: LayoutValues[K],
    arrangement: LayoutArrangement,
  ) => string;
}

// ── Shared option sets ──────────────────────────────────────────────────────

export const SIZE_OPTIONS: ReadonlyArray<SegmentOption> = [
  { value: "full", label: "Full row" },
  { value: "chip", label: "Chip" },
];

/** Where the task tabs sit; the Tabs surface's Position row and tab menus. */
export const TAB_STRIP_PLACEMENT_OPTIONS: ReadonlyArray<{
  readonly value: TabStripPlacement;
  readonly label: string;
}> = [
  { value: "top", label: "Top" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export const SIDE_STRIP_VIEW_OPTIONS: ReadonlyArray<{
  readonly value: SideStripView;
  readonly label: string;
}> = [
  { value: "layered", label: "Layered" },
  { value: "activity", label: "Activity" },
];

export const EDGE_SIDE_OPTIONS: ReadonlyArray<SegmentOption> = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

/**
 * The two bars a reading can live in. The `header` value is the tab strip's
 * bar in every placement - across the top beside the tabs, or the vertical
 * strip's foot - so it is named for the tab strip; the stored value stays
 * `"header"` (L-133).
 */
export const BAR_HOST_OPTIONS: ReadonlyArray<SegmentOption> = [
  { value: "status-bar", label: "Status bar" },
  { value: "header", label: "Tab strip" },
];

/**
 * The two ends of a bar reading's bar. In the vertical strip's foot the
 * readings stack, so `left` and `right` read as "First" and "Last" there;
 * every other bar is horizontal and keeps "Left" and "Right".
 */
export function edgeSideOptions(
  host: BarHost,
  placement: TabStripPlacement,
): ReadonlyArray<SegmentOption> {
  if (host === "header" && placement !== "top") {
    return [
      { value: "left", label: "First" },
      { value: "right", label: "Last" },
    ];
  }
  return EDGE_SIDE_OPTIONS;
}

/** Shown under the examples when the values match none of them. */
export const NO_EXAMPLE_MATCH_COPY =
  "Custom - no example matches the fine-tune below.";

// ── Shared verb sets ────────────────────────────────────────────────────────

export const SHOW_HIDE_VERBS: ReadonlyArray<QuickVerbId> = ["hide", "show"];
export const SIZED_VERBS: ReadonlyArray<QuickVerbId> = [
  "hide",
  "show",
  "chip",
  "full",
];
/** A region that resizes but never hides: the Access pill (G6). */
export const SIZE_ONLY_VERBS: ReadonlyArray<QuickVerbId> = ["chip", "full"];
