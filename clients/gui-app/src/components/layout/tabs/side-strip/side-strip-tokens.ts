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

/** The row list: 2px between rows, 8px inline inset. */
export const SIDE_STRIP_LIST_CLASS = "flex flex-col gap-0.5 px-2";
/** One expanded row: 32px tall, 8px radius, 8px padding and gap. */
export const SIDE_TAB_ROW_CLASS = "h-8 rounded-lg px-2 gap-2";
export const SIDE_TAB_LEADING_CLASS = "size-4";
export const SIDE_TAB_TITLE_CLASS = "text-[0.8125rem] leading-4";
export const SIDE_TAB_TRAILING_CLASS = "min-w-5 h-5";
export const SIDE_TAB_ACTIVE_CLASS = "bg-foreground/8";
export const SIDE_TAB_HOVER_CLASS = "hover:bg-foreground/5";
export const SIDE_TAB_SESSION_ACTIVE_CLASS = "bg-warning-foreground";
/** How strongly the tab colour tints the icon or monogram tile, in percent. */
export const SIDE_TAB_TINT_PERCENT = 28;
export const SIDE_TAB_COLORLESS_TILE_CLASS = "bg-foreground/8";
/** The group colour line down the group's inline-start edge. */
export const SIDE_TAB_GROUP_LINE_CLASS = "w-0.5";
export const SIDE_TAB_GROUP_HEADER_CLASS = "h-7";
/** A collapsed-rail tile. */
export const SIDE_TAB_TILE_CLASS = "size-8";
export const SIDE_TAB_MONOGRAM_CLASS = "text-[0.8125rem] font-semibold";
/** The rail tile's status badge, with a cut-out ring against the canvas. */
export const SIDE_TAB_BADGE_CLASS = "size-2.5 ring-2 ring-canvas";
export const SIDE_TAB_WAITING_CHIP_CLASS =
  "border border-warning/30 bg-warning/10 text-warning-foreground";
