/**
 * What a rail slot LOOKS like, in one place because two surfaces draw it: the
 * epic rail itself, and the strip on Layout ▸ Sidebar that previews it. The
 * strip has to read as the rail - same tile size, same tab underline - and a
 * hand-copied class list drifts the first time either one is tuned.
 *
 * Classes rather than a shared component: the two tiles differ in everything
 * BUT their look. The rail's is a real button that activates a panel, carries a
 * tooltip and reports the panel under a right-click; the strip's is an inert
 * drag handle inside an `aria-hidden` preview.
 */

/** One rail slot: the room a panel icon takes, and its resting colour. */
export const LEFT_PANEL_RAIL_TILE_CLASS =
  "relative size-9 rounded-md text-muted-foreground hover:text-foreground";

/** The underline a horizontal rail draws under the panel it is showing. */
export const LEFT_PANEL_RAIL_TAB_UNDERLINE_CLASS =
  "absolute inset-x-2 bottom-0 rounded-b-none rounded-t";
