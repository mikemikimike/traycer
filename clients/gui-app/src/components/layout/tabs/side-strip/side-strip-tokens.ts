import type { SideGroupLineSeat, SideTabRowVariant } from "./side-tab-row";

/**
 * The vertical tab strip's visual constants, and their only home.
 * Pixel numbers are at a 16px root; `rounded-lg` is 8px (`--radius-lg` over
 * `--radius: 0.375rem`).
 */

/** Expanded strip width: default, drag minimum and drag maximum. */
export const SIDE_STRIP_DEFAULT_WIDTH_PX = 240;
export const SIDE_STRIP_MIN_WIDTH_PX = 192;
export const SIDE_STRIP_MAX_WIDTH_PX = 400;
/** The expanded strip never takes more than 40% of the window. */
export const SIDE_STRIP_MAX_WIDTH_CLASS = "max-w-[40vw]";
/**
 * When the strip owns the title bar (macOS, left) the expanded strip is never
 * narrower than the traffic-light inset plus the title row's controls (S-43):
 * back and forward, New task, the collapse toggle, their gaps and the 8px
 * trailing inset. It follows the inset, so it shrinks when the inspector docks
 * left and takes the lights.
 */
export const SIDE_STRIP_TITLE_ROW_MIN_WIDTH_CLASS =
  "wco:min-w-[calc(var(--window-leading-inset)+8.5rem)]";
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
 * inset outside the row fill: 2px wide, 6px before the row's box.
 */
export const SIDE_TAB_GROUP_LINE_CLASS = "w-0.5";
/**
 * Where each member's segment of the group line sits, so a group's segments
 * join into one line at one x. A lone row's segment reaches across the 2px
 * row gap below it. A split pair's members sit inside the pair's 2px padding:
 * the top member's segment also covers the pair's top padding and the 4px
 * seam, the bottom member's its bottom padding and the row gap. Expanded, the
 * members are also 2px further in than a lone row, so their segments step 2px
 * further out; collapsed, the pair is centred like a lone tile and they do not.
 */
export const SIDE_TAB_GROUP_LINE_SEAT_CLASS: Readonly<
  Record<SideTabRowVariant, Readonly<Record<SideGroupLineSeat, string>>>
> = {
  expanded: {
    row: "-start-1.5 top-0 -bottom-0.5",
    "pair-top": "-start-2 -top-0.5 -bottom-1",
    "pair-bottom": "-start-2 top-0 -bottom-1",
  },
  collapsed: {
    row: "-start-1.5 top-0 -bottom-0.5",
    "pair-top": "-start-1.5 -top-0.5 -bottom-1",
    "pair-bottom": "-start-1.5 top-0 -bottom-1",
  },
};
export const SIDE_TAB_GROUP_HEADER_CLASS = "h-7";
/** A collapsed-rail tile: the collapsed row itself, 32px square. */
export const SIDE_TAB_TILE_CLASS = "size-8 rounded-lg";
/**
 * The collapsed tile's active and hover states: an inset ring on the tile's
 * own fill. The active ring is a state indicator, so it owes a tinted fill the
 * 3:1 of a non-text indicator in both themes: 70% foreground measures about
 * 6:1 on the orange tint in each theme, where 30% read about 2:1.
 */
export const SIDE_TAB_TILE_ACTIVE_CLASS =
  "ring-2 ring-inset ring-foreground/70 text-foreground";
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
/** The inline rename input in an expanded row's title slot. */
export const SIDE_TAB_TITLE_INPUT_CLASS =
  "min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring";
/** A group header's colour pill holding the group name; the colour arrives as `--side-tab-group-color`. */
export const SIDE_TAB_GROUP_PILL_CLASS =
  "rounded-md bg-(--side-tab-group-color) px-1.5 text-ui-xs font-medium text-black";
/** A row's footprint before hydration: the expanded row's height and radius. */
export const SIDE_TAB_ROW_PLACEHOLDER_CLASS = "h-8 w-full rounded-lg";
/** The 8px inline inset of the top block's rows. */
export const SIDE_STRIP_INSET_CLASS = "px-2";
/** The foot: 8px around and between its controls. */
export const SIDE_STRIP_FOOT_CLASS = "gap-2 p-2";
/** A custom icon's glyphs on a 16px tile: one grapheme, or two. */
export const SIDE_TAB_CUSTOM_ICON_SINGLE_CLASS = "text-xs leading-none";
export const SIDE_TAB_CUSTOM_ICON_PAIR_CLASS =
  "text-micro font-medium leading-none";
/** A group header's member count. */
export const SIDE_TAB_GROUP_COUNT_CLASS = "text-ui-xs tabular-nums";
/** The dragged row or pair: an opaque, raised copy of the source. */
export const SIDE_TAB_DRAG_OVERLAY_CLASS = "rounded-lg bg-canvas shadow-lg";
