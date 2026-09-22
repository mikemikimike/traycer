/**
 * The vertical tab strip's visual constants, and their only home.
 * Pixel numbers are at a 16px root; `rounded-lg` is 8px (`--radius-lg` over
 * `--radius: 0.375rem`).
 */

/** Expanded strip width: default, drag minimum and drag maximum. */
export const SIDE_STRIP_DEFAULT_WIDTH_PX = 240;
export const SIDE_STRIP_MIN_WIDTH_PX = 192;
export const SIDE_STRIP_MAX_WIDTH_PX = 400;
/** The expanded strip never takes more than this share of the window. */
export const SIDE_STRIP_MAX_WIDTH_VW = 40;
/** The collapsed, icon-only rail. */
export const SIDE_STRIP_RAIL_WIDTH_PX = 56;
/** A handle drag below this width snaps to the rail: the midpoint of the minimum and the rail. */
export const SIDE_STRIP_SNAP_TO_RAIL_BELOW_PX =
  (SIDE_STRIP_MIN_WIDTH_PX + SIDE_STRIP_RAIL_WIDTH_PX) / 2;

/** The row list: 2px between rows, 8px inline inset, 4px block inset so the
 * first and last tiles' badge and focus ring are not clipped by the scroller. */
export const SIDE_STRIP_LIST_CLASS = "flex flex-col gap-0.5 px-2 py-1";
/** One expanded row: 32px tall, 8px radius, 8px padding and gap. */
export const SIDE_TAB_ROW_CLASS = "h-8 rounded-lg px-2 gap-2";
/** The expanded row's leading slot: a fixed 16px so titles line up. */
export const SIDE_TAB_LEADING_CLASS = "size-4";
/** A custom icon or monogram tile in the 16px leading slot. */
export const SIDE_TAB_LEADING_TILE_CLASS =
  "size-4 rounded-sm text-micro font-semibold leading-none";
export const SIDE_TAB_TITLE_CLASS = "text-[0.8125rem] leading-4";
export const SIDE_TAB_TRAILING_CLASS = "min-w-5 h-5";
export const SIDE_TAB_ACTIVE_CLASS = "bg-foreground/8";
export const SIDE_TAB_HOVER_CLASS = "hover:bg-foreground/5";
export const SIDE_TAB_SESSION_ACTIVE_CLASS = "bg-warning-foreground";
/** The tab colour at 28% over transparency; the colour arrives as `--side-tab-tint`. */
export const SIDE_TAB_TINT_FILL_CLASS =
  "bg-[color-mix(in_oklab,var(--side-tab-tint)_28%,transparent)]";
export const SIDE_TAB_COLORLESS_TILE_CLASS = "bg-foreground/8";
/**
 * The group colour line down the group's inline-start edge, in the list's
 * inset outside the row fill; each member's segment reaches across the 2px
 * row gap so a group's segments join into one line.
 */
export const SIDE_TAB_GROUP_LINE_CLASS = "w-0.5 -start-1.5 top-0 -bottom-0.5";
export const SIDE_TAB_GROUP_HEADER_CLASS = "h-7";
/** A collapsed-rail tile: the collapsed row itself, 32px square. */
export const SIDE_TAB_TILE_CLASS = "size-8 rounded-lg";
/** The collapsed tile's active and hover states: an inset ring that reads on any fill. */
export const SIDE_TAB_TILE_ACTIVE_CLASS =
  "ring-2 ring-inset ring-foreground/30 text-foreground";
export const SIDE_TAB_TILE_HOVER_CLASS =
  "hover:ring-2 hover:ring-inset hover:ring-foreground/15";
export const SIDE_TAB_MONOGRAM_CLASS = "text-[0.8125rem] font-semibold";
/** The status badge on a tile's corner, with a cut-out ring against the canvas. */
export const SIDE_TAB_BADGE_CLASS = "size-2.5 ring-2 ring-canvas";
/** Where the badge sits: centred on the tile's top-right corner area. */
export const SIDE_TAB_BADGE_POSITION_CLASS =
  "absolute top-0 right-0 translate-x-1/4 -translate-y-1/4";
/**
 * A split pair: two member rows joined in the rail capsule's fill, with a
 * 10px radius (`rounded-xl`) so the 8px rows inside its 2px padding sit
 * concentric.
 */
export const SIDE_SPLIT_PAIR_CLASS = "rounded-xl bg-foreground/6 p-0.5";
/** The seam between a pair's members and its hairline, expanded and collapsed. */
export const SIDE_SPLIT_PAIR_SEAM_CLASS = "h-1";
export const SIDE_SPLIT_PAIR_HAIRLINE_CLASS = "h-px bg-border/60";
export const SIDE_SPLIT_PAIR_EXPANDED_HAIRLINE_CLASS = "mx-2 flex-1";
export const SIDE_SPLIT_PAIR_COLLAPSED_HAIRLINE_CLASS = "w-5";
