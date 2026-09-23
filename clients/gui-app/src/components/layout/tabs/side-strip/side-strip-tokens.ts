import { cn } from "@/lib/utils";
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
/**
 * The collapsed, icon-only rail (D4). On macOS with the strip at the left it
 * widens to the traffic-light inset (D15), and the tiles stay centred.
 */
export const SIDE_STRIP_RAIL_WIDTH_PX = 60;
/** A handle drag below this width snaps to the rail: the midpoint of the minimum and the rail. */
export const SIDE_STRIP_SNAP_TO_RAIL_BELOW_PX =
  (SIDE_STRIP_MIN_WIDTH_PX + SIDE_STRIP_RAIL_WIDTH_PX) / 2;

/** The row list: 2px between rows and an 8px inset all round, so nothing a
 * row draws past its box is clipped by the scroller at the list's edges: the
 * badge, the focus ring, and the waiting pulse's 8px ring. */
export const SIDE_STRIP_LIST_CLASS = "flex flex-col gap-0.5 p-2";
/** One expanded row: 32px tall, 8px radius, 8px padding and gap. */
export const SIDE_TAB_ROW_CLASS = "h-8 rounded-lg px-2 gap-2";
/**
 * The expanded row's leading slot: a fixed 16px so titles line up, then 8px
 * reserved beside it for a leading tile's badge, on every row so a badge
 * never moves a title.
 */
export const SIDE_TAB_LEADING_CLASS = "size-4 me-2";
/** A custom icon or monogram tile in the 16px leading slot. */
export const SIDE_TAB_LEADING_TILE_CLASS =
  "size-4 rounded-sm text-micro font-semibold leading-none";
export const SIDE_TAB_TITLE_CLASS = "text-[0.8125rem] leading-4";
export const SIDE_TAB_TRAILING_CLASS = "min-w-5 h-5";
export const SIDE_TAB_ACTIVE_CLASS = "bg-foreground/8";
export const SIDE_TAB_HOVER_CLASS = "hover:bg-foreground/5";
export const SIDE_TAB_SESSION_ACTIVE_CLASS = "bg-warning-foreground";
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
/**
 * A collapsed-rail tile (D4): the collapsed row itself, 40x44 with a 10px
 * radius, stacking the monogram over the meter 4px apart.
 */
export const SIDE_TAB_TILE_CLASS = "h-11 w-10 rounded-xl flex-col gap-1";
/** The collapsed tile's active and hover fills: the expanded row's own. */
export const SIDE_TAB_TILE_ACTIVE_CLASS = "bg-foreground/8 text-foreground";
export const SIDE_TAB_TILE_HOVER_CLASS = "hover:bg-foreground/5";
/**
 * The strip's own ground, so a badge reads as cut out of what it sits on: the
 * canvas on a narrow window, the shell ground on a wide one.
 */
const SIDE_STRIP_GROUND_FILL_CLASS = "bg-canvas md:bg-shell-ground";
/** The expanded row's leading-tile badge: a 10px disc, ringed in the ground. */
export const SIDE_TAB_BADGE_CLASS = cn(
  "size-2.5 ring-2 ring-canvas md:ring-shell-ground",
  SIDE_STRIP_GROUND_FILL_CLASS,
);
/** Where a collapsed group's badge sits on its expanded header: the header's top-right corner. */
export const SIDE_TAB_BADGE_POSITION_CLASS =
  "absolute top-0 right-0 translate-x-1/4 -translate-y-1/4";
/**
 * Where a leading tile's badge sits: in the space reserved beside the tile,
 * level with its top and clear of its monogram, 1px past its edge.
 */
export const SIDE_TAB_LEADING_BADGE_POSITION_CLASS =
  "absolute -top-0.5 left-full ml-px";
/**
 * The rail tile's badge (D5): a 14px disc of the strip's ground holding a 12px
 * status glyph, at the tile's top-right, 1px above and 1px in.
 */
export const SIDE_TAB_RAIL_BADGE_CLASS = cn(
  "size-3.5",
  SIDE_STRIP_GROUND_FILL_CLASS,
);
export const SIDE_TAB_RAIL_BADGE_GLYPH_CLASS = "size-3";
export const SIDE_TAB_RAIL_BADGE_POSITION_CLASS = "absolute -top-px right-px";
/** The meter: a tile's 3px pips under the monogram, a row's 10px pips. */
export const SIDE_TAB_METER_CLASS = {
  tile: "h-1 gap-0.5",
  row: "h-2.5 gap-0.5",
} as const;
export const SIDE_TAB_METER_PIP_CLASS = {
  tile: "h-0.75 w-1.25 rounded-[1.5px]",
  row: "h-2.5 w-1 rounded-xs",
} as const;
export const SIDE_TAB_METER_MORE_CLASS = {
  tile: "text-[0.5rem] leading-1",
  row: "text-micro",
} as const;
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
/** A group header's member count. */
export const SIDE_TAB_GROUP_COUNT_CLASS = "text-ui-xs tabular-nums";
/** The dragged row or pair: an opaque, raised copy of the source. */
export const SIDE_TAB_DRAG_OVERLAY_CLASS = "rounded-lg bg-canvas shadow-lg";
/** A nav row's (Inbox, All tasks) collapsed form: a 32px icon tile (D6). */
export const SIDE_STRIP_NAV_TILE_CLASS = "size-8 rounded-lg";
/** The collapsed Inbox tile's needs-you count, on its top-right corner, cut out of the strip's ground. */
export const SIDE_STRIP_NAV_TILE_COUNT_CLASS =
  "absolute -top-1 -right-1 h-4 min-w-4 rounded-md px-1 text-overline leading-4 ring-2 ring-canvas md:ring-shell-ground";
/** The collapsed Inbox tile's status-unavailable dot, on its top-right corner, cut out of the strip's ground. */
export const SIDE_STRIP_NAV_TILE_UNKNOWN_DOT_CLASS =
  "absolute -top-0.5 -right-0.5 bg-canvas md:bg-shell-ground ring-2 ring-canvas md:ring-shell-ground";
/** The "Tasks · N" label above the rows. */
export const SIDE_STRIP_SECTION_LABEL_CLASS =
  "px-2 pt-2 text-overline font-medium uppercase tracking-wide";
/** The foot's account row: avatar, name and host line. */
export const SIDE_STRIP_ACCOUNT_ROW_CLASS = "h-11 rounded-lg px-2 gap-2";
/** The host-health dot on the avatar's bottom-right, cut out of the strip's ground. */
export const SIDE_STRIP_HOST_DOT_CLASS =
  "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-canvas md:ring-shell-ground";
